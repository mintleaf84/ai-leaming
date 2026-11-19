import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../../support/ffi_db.dart';

/// 守的是「离线作答不会静默丢、不会串账号」这几条线。
///
/// 逐条对应的线上事故形态：
/// 1. **题目缓存必须可覆盖**：`cacheQuestions` 二次写入若变成新增，
///    同一道题会在库里出现两份，`pickRandom` 抽到哪份看运气（旧题面 + 新答案 = 误判）；
/// 2. **过期题不出**：缓存超过 7 天后题面可能已在后台被改，继续用旧答案判分
///    会污染掌握度，所以 `pickRandom` / `questionById` 必须返回空/null；
/// 3. **没有 answer 的题不出**：离线判分只能回退成空答案，会把整场作答判错；
/// 4. **tag 匹配必须带引号**：`tag='ab'` 用裸 LIKE 会命中 `tags=["xabc"]`，
///    用户选了「ab 专项」却抽到不相关的题；
/// 5. **待同步按账号隔离**：`pendingSessions(userId:)` 是「A 的作答不会被 B 上传」
///    的唯一闸口，过滤条件写漏一个字就是跨账号串数据；
/// 6. **只标记真正上传过的 clientKey**：按 local_id 整片标记会把请求期间新增、
///    或被 5 秒宽限期跳过的作答一起标成已同步，它们再也不会重试——静默丢数据；
/// 7. **同一 (localId, questionId) 覆盖**：重做同一题应更新答案而不是堆积两行，
///    否则服务端会收到两条互相矛盾的作答。
///
/// 这里不碰 `LocalDb` 单例（硬编码 `getDatabasesPath()`，测试环境没有平台通道），
/// 统一用 `LocalPracticeStore(db: ...)` 注入内存库。
void main() {
  setUpAll(setUpFfiDatabaseFactory);

  late Database db;
  late LocalPracticeStore store;

  setUp(() async {
    db = await openMemoryDb();
    store = LocalPracticeStore(db: Future<Database>.value(db));
  });

  tearDown(() async {
    await db.close();
  });

  /// 把某个会话的作答时间整体前移，绕开 5 秒同步宽限期。
  Future<void> backdateAnswers(String localId, int answeredAt) async {
    await db.rawUpdate(
      'UPDATE pending_answers SET answered_at = ? WHERE local_id = ?',
      <Object?>[answeredAt, localId],
    );
  }

  int nowMs() => DateTime.now().millisecondsSinceEpoch;

  Question question(
    String id, {
    String content = '题面',
    List<String> options = const <String>['A', 'B'],
    String? answer = 'A',
    List<String> tags = const <String>[],
    String type = 'single',
  }) {
    return Question(
      id: id,
      content: content,
      options: options,
      answer: answer,
      tags: tags,
      type: type,
    );
  }

  group('cacheQuestions：按 id 覆盖', () {
    test('同 id 二次写入是覆盖不是新增，content 已更新', () async {
      await store.cacheQuestions(<Question>[question('1', content: '旧题面')]);
      await store.cacheQuestions(<Question>[question('1', content: '新题面')]);

      expect(await store.cachedQuestionCount(), 1);
      final cached = await store.questionById('1');
      expect(cached?.content, '新题面');
    });

    test('空列表是 no-op，不建任何行', () async {
      await store.cacheQuestions(const <Question>[]);
      expect(await store.cachedQuestionCount(), 0);
    });

    test('非数字 id 抛 ArgumentError（INTEGER 主键写不进去）', () async {
      expect(
        store.cacheQuestions(<Question>[question('q-abc')]),
        throwsArgumentError,
      );
    });
  });

  group('pickRandom：只出「新鲜且有答案」的题', () {
    test('8 天前的记录被排除（TTL = 7 天）', () async {
      await store.cacheQuestions(<Question>[question('1'), question('2')]);
      final stale = nowMs() - const Duration(days: 8).inMilliseconds;
      await db.rawUpdate(
        'UPDATE cached_questions SET fetched_at = ? WHERE id = 1',
        <Object?>[stale],
      );

      final picked = await store.pickRandom();
      expect(picked.map((q) => q.id), <String>['2']);
    });

    test('answer 为 null 或空串的题不出', () async {
      await store.cacheQuestions(<Question>[
        question('1'),
        question('2', answer: null),
        question('3', answer: ''),
      ]);

      final picked = await store.pickRandom();
      expect(picked.map((q) => q.id), <String>['1']);
    });

    test('tag 用带引号的 LIKE 匹配：tag=ab 不命中 tags=["xabc"]', () async {
      await store.cacheQuestions(<Question>[
        question('1', tags: const <String>['ab']),
        question('2', tags: const <String>['xabc']),
      ]);

      final picked = await store.pickRandom(tag: 'ab');
      expect(picked.map((q) => q.id), <String>['1']);
    });

    test('limit 生效', () async {
      await store.cacheQuestions(<Question>[
        for (var i = 1; i <= 5; i++) question('$i'),
      ]);

      expect((await store.pickRandom(limit: 2)).length, 2);
    });
  });

  group('questionById：离线判分取题', () {
    test('新鲜命中并正确还原 options/tags/type', () async {
      await store.cacheQuestions(<Question>[
        question(
          '7',
          options: const <String>['甲', '乙', '丙'],
          tags: const <String>['教育学', '课程'],
          type: 'multiple',
        ),
      ]);

      final cached = await store.questionById('7');
      expect(cached, isNotNull);
      expect(cached!.options, <String>['甲', '乙', '丙']);
      expect(cached.tags, <String>['教育学', '课程']);
      expect(cached.type, 'multiple');
      expect(cached.answer, 'A');
    });

    test('type 为 NULL 时回退成 single 默认值', () async {
      await db.insert('cached_questions', <String, Object?>{
        'id': 9,
        'content': '题面',
        'options': '["A","B"]',
        'type': null,
        'tags': '[]',
        'answer': 'A',
        'explanation': null,
        'fetched_at': nowMs(),
      });

      expect((await store.questionById('9'))?.type, 'single');
    });

    test('过期返回 null', () async {
      await store.cacheQuestions(<Question>[question('1')]);
      await db.rawUpdate(
        'UPDATE cached_questions SET fetched_at = ? WHERE id = 1',
        <Object?>[nowMs() - const Duration(days: 8).inMilliseconds],
      );

      expect(await store.questionById('1'), isNull);
    });

    test('非数字 id 返回 null 不抛', () async {
      expect(await store.questionById('q-abc'), isNull);
    });
  });

  group('本地会话', () {
    test('createLocalSession 返回 local_ 前缀的 id', () async {
      final localId = await store.createLocalSession(
        userId: 'u1',
        mode: 'random',
        questionIds: const <String>['1', '2'],
      );

      expect(localId, startsWith('local_'));
      final rows = await db.query(
        'local_sessions',
        where: 'local_id = ?',
        whereArgs: <Object?>[localId],
      );
      expect(rows.single['question_ids'], '["1","2"]');
      expect(rows.single['user_id'], 'u1');
    });

    test('ensureLocalSession 同 localId 二次调用幂等且不覆盖已有 mode', () async {
      const localId = 'local_1';
      await store.ensureLocalSession(
        localId: localId,
        userId: 'u1',
        mode: 'random',
        questionIds: const <String>['1'],
      );
      await store.ensureLocalSession(
        localId: localId,
        userId: 'u1',
        mode: 'sequence',
        questionIds: const <String>['1', '2'],
      );

      final rows = await db.query('local_sessions');
      expect(rows.length, 1);
      expect(rows.single['mode'], 'random');
      expect(rows.single['question_ids'], '["1"]');
    });
  });

  group('recordAnswer', () {
    test('同一 (localId, questionId) 二次作答覆盖旧行，client_key 固定', () async {
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '5',
        userAnswer: 'A',
        isCorrect: false,
      );
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '5',
        userAnswer: 'B',
        isCorrect: true,
        durationMs: 3000,
      );

      final rows = await db.query('pending_answers');
      expect(rows.length, 1);
      expect(rows.single['client_key'], 'local_1:5');
      expect(rows.single['user_answer'], 'B');
      expect(rows.single['is_correct'], 1);
      expect(rows.single['duration_ms'], 3000);
    });

    test('非数字 questionId 抛 ArgumentError', () async {
      expect(
        store.recordAnswer(
          localId: 'local_1',
          userId: 'u1',
          questionId: 'q-abc',
          userAnswer: 'A',
          isCorrect: true,
        ),
        throwsArgumentError,
      );
    });
  });

  group('pendingSessions：宽限期 + 账号隔离 + 分组', () {
    test('刚写入的作答落在 5 秒宽限期内，不出现在结果里', () async {
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '1',
        userAnswer: 'A',
        isCorrect: true,
      );

      expect(await store.pendingSessions(userId: 'u1'), isEmpty);
    });

    test('A 的作答不会出现在 userId=B 的查询里', () async {
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '1',
        userAnswer: 'A',
        isCorrect: true,
      );
      await backdateAnswers('local_1', nowMs() - 10000);

      expect(await store.pendingSessions(userId: 'u1'), hasLength(1));
      expect(await store.pendingSessions(userId: 'u2'), isEmpty);
    });

    test('按 local_id 分组且顺序稳定，会话行缺失时 mode 回退 random', () async {
      await store.createLocalSession(
        userId: 'u1',
        mode: 'sequence',
        questionIds: const <String>['1'],
      );
      const firstLocalId = 'local_first';
      await store.ensureLocalSession(
        localId: firstLocalId,
        userId: 'u1',
        mode: 'sequence',
        questionIds: const <String>['1', '2'],
      );
      // 第二个会话故意不写 local_sessions 行，验证 mode 回退。
      const secondLocalId = 'local_second';

      final base = nowMs() - 60000;
      await store.recordAnswer(
        localId: firstLocalId,
        userId: 'u1',
        questionId: '1',
        userAnswer: 'A',
        isCorrect: true,
      );
      await store.recordAnswer(
        localId: firstLocalId,
        userId: 'u1',
        questionId: '2',
        userAnswer: 'B',
        isCorrect: false,
      );
      await store.recordAnswer(
        localId: secondLocalId,
        userId: 'u1',
        questionId: '3',
        userAnswer: 'C',
        isCorrect: true,
      );
      await backdateAnswers(firstLocalId, base);
      await db.rawUpdate(
        'UPDATE pending_answers SET answered_at = ? WHERE client_key = ?',
        <Object?>[base + 1000, '$firstLocalId:2'],
      );
      await backdateAnswers(secondLocalId, base + 2000);

      final sessions = await store.pendingSessions(userId: 'u1');
      expect(sessions.map((s) => s.localId), <String>[
        firstLocalId,
        secondLocalId,
      ]);
      expect(sessions.first.mode, 'sequence');
      expect(sessions.first.answers.map((a) => a.questionId), <int>[1, 2]);
      expect(sessions.last.mode, 'random');
      expect(sessions.last.answers.single.userAnswer, 'C');
    });
  });

  group('markAnswersSynced', () {
    test('只标记传入的 clientKey，其余仍待同步', () async {
      for (final id in <String>['1', '2', '3']) {
        await store.recordAnswer(
          localId: 'local_1',
          userId: 'u1',
          questionId: id,
          userAnswer: 'A',
          isCorrect: true,
        );
      }

      await store.markAnswersSynced(<String>['local_1:1', 'local_1:2']);

      expect(await store.pendingCount(), 1);
      final remaining = await db.query(
        'pending_answers',
        where: 'synced_at IS NULL',
      );
      expect(remaining.single['client_key'], 'local_1:3');
    });

    test('空列表是 no-op', () async {
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '1',
        userAnswer: 'A',
        isCorrect: true,
      );

      await store.markAnswersSynced(const <String>[]);
      expect(await store.pendingCount(), 1);
    });
  });

  group('markLocalSessionServerId / pendingCount / meta', () {
    test('传 null 不写库，传值能查到', () async {
      await store.createLocalSession(
        userId: 'u1',
        mode: 'random',
        questionIds: const <String>['1'],
      );
      final localId =
          (await db.query('local_sessions')).single['local_id'] as String;

      await store.markLocalSessionServerId(localId, null);
      expect(
        (await db.query('local_sessions')).single['synced_session_id'],
        isNull,
      );

      await store.markLocalSessionServerId(localId, 'srv_99');
      expect(
        (await db.query('local_sessions')).single['synced_session_id'],
        'srv_99',
      );
    });

    test('pendingCount 只计 synced_at IS NULL', () async {
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '1',
        userAnswer: 'A',
        isCorrect: true,
      );
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '2',
        userAnswer: 'B',
        isCorrect: true,
      );
      await store.markAnswersSynced(<String>['local_1:1']);

      expect(await store.pendingCount(), 1);
    });

    test('setMeta/getMeta 往返 + 覆盖写', () async {
      expect(await store.getMeta('last_sync'), isNull);

      await store.setMeta('last_sync', '100');
      expect(await store.getMeta('last_sync'), '100');

      await store.setMeta('last_sync', '200');
      expect(await store.getMeta('last_sync'), '200');
      expect((await db.query('sync_meta')).length, 1);
    });
  });
}
