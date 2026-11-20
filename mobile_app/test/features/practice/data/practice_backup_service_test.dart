import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:mobile_app/features/practice/data/practice_backup_service.dart';
import 'package:mobile_app/features/practice/domain/practice_backup.dart';
import 'package:mobile_app/features/practice/domain/practice_resume.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/ffi_db.dart';

/// 守的是「换机备份不丢作答、不串账号、不重复」这几条线。
///
/// 逐条对应的线上事故形态：
/// 1. **导出只含不可重建数据**：把 `cached_questions` 也导出去，备份从 KB 涨到
///    MB，还要处理 schema 版本——§30.2 明确不做；
/// 2. **导入按账号校验**：A 的待同步作答进了 B 的库，flush 时会带 B 的凭据上传，
///    服务端会把这些作答记到 B 名下（跨账号串数据）；
/// 3. **幂等**：同一份备份导入两次若产生两份作答，服务端会收到互相矛盾的记录
///    （同一题一次对一次错），掌握度直接算错；
/// 4. **坏 JSON 不崩**：剪贴板内容可能被编辑器改写/截断，解析失败必须是
///    「可读的拒绝」，不是异常冒到界面；
/// 5. **断点只在更新时覆盖**：新机上已经开了新的一场，导入旧备份不该把人拽回去；
/// 6. **设置只认白名单**：剪贴板是用户可编辑的，任意 key 写进 SharedPreferences
///    等于绕过了各 key 自己的校验。
void main() {
  setUpAll(setUpFfiDatabaseFactory);

  late Database db;
  late LocalPracticeStore store;
  late FakePreferencesStore preferences;
  late PracticeBackupService service;

  const userId = '7';
  const otherUserId = '8';

  PracticeResume resumeFor(String owner, {required DateTime savedAt}) {
    return PracticeResume(
      sessionId: 'session_1',
      answers: const <ResumeAnswer>[
        ResumeAnswer(questionId: '11', isCorrect: true),
      ],
      nextIndex: 1,
      total: 5,
      mode: 'random',
      userId: owner,
      savedAt: savedAt,
    );
  }

  setUp(() async {
    db = await openMemoryDb();
    store = LocalPracticeStore(db: Future<Database>.value(db));
    preferences = FakePreferencesStore(
      initial: <String, String>{
        PreferencesKeys.themeMode: 'dark',
        PreferencesKeys.reviewMode: 'immersive',
        PreferencesKeys.practiceResume: jsonEncode(
          resumeFor(userId, savedAt: DateTime(2026, 11, 19, 10)).toJson(),
        ),
      },
    );
    service = PracticeBackupService(store: store, preferences: preferences);

    await store.ensureLocalSession(
      localId: 'local_1',
      userId: userId,
      mode: 'random',
      questionIds: const <String>['11', '12'],
    );
    await store.recordAnswer(
      localId: 'local_1',
      userId: userId,
      questionId: '11',
      userAnswer: 'A',
      isCorrect: true,
      durationMs: 4200,
    );
    // 另一个账号的数据绝不能出现在导出里。
    await store.ensureLocalSession(
      localId: 'local_other',
      userId: otherUserId,
      mode: 'random',
      questionIds: const <String>['21'],
    );
    await store.recordAnswer(
      localId: 'local_other',
      userId: otherUserId,
      questionId: '21',
      userAnswer: 'B',
      isCorrect: false,
      durationMs: 1000,
    );
  });

  tearDown(() async {
    await db.close();
  });

  Future<Map<String, dynamic>> exportDecoded() async {
    final raw = await service.exportJson(userId);
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> clearPracticeTables() async {
    await db.delete('pending_answers');
    await db.delete('local_sessions');
  }

  group('导出', () {
    test('结构含 version/exportedAt/userId/成绩数据，且不含 cached_questions', () async {
      final json = await exportDecoded();

      expect(json['version'], 1);
      expect(json['userId'], userId);
      expect(DateTime.tryParse(json['exportedAt'] as String), isNotNull);

      final answers = json['pendingAnswers'] as List<dynamic>;
      expect(answers, hasLength(1));
      final answer = answers.single as Map<String, dynamic>;
      expect(answer['clientKey'], 'local_1:11');
      expect(answer['localId'], 'local_1');
      expect(answer['questionId'], 11);
      expect(answer['userAnswer'], 'A');
      expect(answer['isCorrect'], true);
      expect(answer['durationMs'], 4200);
      expect(answer['answeredAt'], isA<int>());

      final sessions = json['localSessions'] as List<dynamic>;
      expect(sessions, hasLength(1));
      final session = sessions.single as Map<String, dynamic>;
      expect(session['localId'], 'local_1');
      expect(session['questionIds'], <String>['11', '12']);

      // 题库可重建，导出它只会让备份变胖。
      expect(json.containsKey('cached_questions'), isFalse);
      expect(json.containsKey('questions'), isFalse);
    });

    test('只导出当前账号的数据，断点与设置一并带上', () async {
      final json = await exportDecoded();

      final answers = json['pendingAnswers'] as List<dynamic>;
      expect(answers, hasLength(1));
      expect(
        answers.map((item) => (item as Map)['localId']),
        isNot(contains('local_other')),
      );

      final resume = json['resume'] as Map<String, dynamic>;
      expect(resume['sessionId'], 'session_1');
      expect(resume['userId'], userId);

      expect(json['settings'], <String, dynamic>{
        PreferencesKeys.themeMode: 'dark',
        PreferencesKeys.reviewMode: 'immersive',
      });
    });

    test('断点不属于当前账号时不导出（避免导入端装不进去的半份数据）', () async {
      preferences.values[PreferencesKeys.practiceResume] = jsonEncode(
        resumeFor(otherUserId, savedAt: DateTime(2026, 11, 19)).toJson(),
      );

      final json = await exportDecoded();
      expect(json['resume'], isNull);
    });
  });

  group('导入', () {
    test('导入后作答与会话恢复，pendingCount 与服务端待上传口径一致', () async {
      // 作答时间前移，绕开 flush 的 5 秒宽限期（否则刚导入的记录不会被立即上传）。
      await db.rawUpdate(
        'UPDATE pending_answers SET answered_at = ?',
        <Object?>[DateTime.now().millisecondsSinceEpoch - 60000],
      );
      final raw = await service.exportJson(userId);
      await clearPracticeTables();
      // 模拟新设备：本地还没有断点，导入后应从备份恢复。
      preferences.values.remove(PreferencesKeys.practiceResume);
      expect(await store.pendingCount(), 0);

      final result = await service.importJson(
        raw: raw,
        currentUserId: userId,
      );

      expect(result.rejected, isFalse);
      expect(result.addedAnswers, 1);
      expect(result.addedSessions, 1);
      expect(result.skippedAnswers, 0);
      expect(result.skippedSessions, 0);
      expect(result.resumeImported, isTrue);
      expect(result.settingsImported, isTrue);
      expect(result.summary, '新增 2 / 跳过 0');

      expect(await store.pendingCount(), 1);
      // 导入的作答必须仍是「未同步」，否则永远不会被 flush 上传。
      final pending = await store.pendingSessions(userId: userId);
      expect(pending, hasLength(1));
      expect(pending.single.answers.single.clientKey, 'local_1:11');
      expect(await store.localSessionOwner('local_1'), userId);
    });

    test('同一份备份导入两次：第二次全部跳过，不产生重复作答', () async {
      final raw = await service.exportJson(userId);
      await clearPracticeTables();

      await service.importJson(raw: raw, currentUserId: userId);
      final second = await service.importJson(raw: raw, currentUserId: userId);

      expect(second.added, 0);
      expect(second.skipped, 2);
      expect(second.summary, '新增 0 / 跳过 2');
      expect(await store.pendingCount(), 1);
      expect(await store.cachedQuestionCount(), 0, reason: '题库缓存不随备份导入');
    });

    test('userId 不一致：整份拒绝，一条都不写', () async {
      final raw = await service.exportJson(userId);
      await clearPracticeTables();

      final result = await service.importJson(
        raw: raw,
        currentUserId: otherUserId,
      );

      expect(result.rejected, isTrue);
      expect(result.rejection, contains('其他账号'));
      expect(await store.pendingCount(), 0);
      final ownsOther = await store.localSessionOwner('local_1');
      expect(ownsOther, isNull);
    });

    test('坏 JSON / 版本不支持 / 顶层不是对象：返回可读拒绝，不抛异常', () async {
      await clearPracticeTables();
      final cases = <String, String>{
        '不是 JSON': '这不是 JSON',
        '半截 JSON': '{"version":1,"userId":"7",',
        '顶层是数组': '[]',
        '版本不支持': '{"version":99,"userId":"7"}',
        '缺少账号': '{"version":1}',
      };

      for (final entry in cases.entries) {
        final result = await service.importJson(
          raw: entry.value,
          currentUserId: userId,
        );
        expect(result.rejected, isTrue, reason: entry.key);
        expect(result.rejection, isNotNull, reason: entry.key);
      }
      expect(await store.pendingCount(), 0);
    });

    test('单条作答字段坏掉只丢那一条，账号合法的其余数据照常导入', () async {
      await clearPracticeTables();
      final raw = jsonEncode(<String, dynamic>{
        'version': 1,
        'exportedAt': DateTime(2026, 11, 20).toIso8601String(),
        'userId': userId,
        'pendingAnswers': <Object?>[
          <String, dynamic>{
            'clientKey': 'local_9:1',
            'localId': 'local_9',
            'questionId': 1,
            'userAnswer': 'A',
            'isCorrect': true,
            'durationMs': null,
            'answeredAt': 1700000000000,
          },
          // isCorrect 是字符串：宁可丢一条也不写进库（服务端要求 bool）。
          <String, dynamic>{
            'clientKey': 'local_9:2',
            'localId': 'local_9',
            'questionId': 2,
            'userAnswer': 'B',
            'isCorrect': 'true',
            'answeredAt': 1700000000000,
          },
        ],
        'localSessions': <Object?>[],
        'resume': null,
        'settings': <String, String>{},
      });

      final result = await service.importJson(raw: raw, currentUserId: userId);
      expect(result.addedAnswers, 1);
      expect(await store.pendingCount(), 1);
    });

    test('本地已有更新的断点时，导入旧断点不覆盖', () async {
      final older = resumeFor(userId, savedAt: DateTime(2026, 11, 18));
      final raw = jsonEncode(<String, dynamic>{
        'version': 1,
        'exportedAt': DateTime(2026, 11, 20).toIso8601String(),
        'userId': userId,
        'pendingAnswers': <Object?>[],
        'localSessions': <Object?>[],
        'resume': older.toJson(),
        'settings': <String, String>{},
      });

      final result = await service.importJson(raw: raw, currentUserId: userId);
      expect(result.resumeImported, isFalse);
      expect(
        PracticeResume.decode(
          preferences.values[PreferencesKeys.practiceResume],
        )?.savedAt,
        DateTime(2026, 11, 19, 10),
      );
    });

    test('设置只写白名单键：备份里的 diagnostics_log 不会被写进本地', () async {
      final json = await exportDecoded();
      final settings =
          json['settings'] as Map<String, dynamic>
            ..['diagnostics_log'] = '[{"evil":true}]'
            ..[PreferencesKeys.themeMode] = 'light';
      final raw = jsonEncode(json);

      final result = await service.importJson(raw: raw, currentUserId: userId);

      expect(result.settingsImported, isTrue);
      expect(preferences.values[PreferencesKeys.themeMode], 'light');
      expect(preferences.values.containsKey('diagnostics_log'), isFalse);
      expect(
        settings[PreferencesKeys.reviewMode],
        'immersive',
        reason: '导出时带了复习模式',
      );
    });
  });

  group('BackupAnswer / BackupLocalSession 解析', () {
    test('缺字段的行返回 null，不抛异常', () {
      expect(BackupAnswer.fromJson(null), isNull);
      expect(BackupAnswer.fromJson(<String, dynamic>{}), isNull);
      expect(
        BackupAnswer.fromJson(<String, dynamic>{
          'clientKey': 'k',
          'localId': 'l',
          'questionId': 0,
          'isCorrect': true,
          'answeredAt': 1,
        }),
        isNull,
        reason: '题号必须是正整数',
      );
      expect(BackupLocalSession.fromJson(<String, dynamic>{
        'localId': 'l',
        'questionIds': <String>[],
        'startedAt': 1,
      }), isNull, reason: '空题序的会话无法恢复，直接丢弃');
    });
  });
}
