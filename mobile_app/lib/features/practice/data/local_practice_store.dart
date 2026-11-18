import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../../core/local/local_db.dart';
import '../domain/question.dart';

/// 一条待同步的单题作答记录。
class PendingAnswer {
  final String clientKey;
  final int questionId;
  final String? userAnswer;
  final bool isCorrect;
  final int? durationMs;

  /// 作答时间（毫秒）。用于给「同一 localId 的不同批次」构造稳定且互不相同的幂等键。
  final int answeredAt;

  const PendingAnswer({
    required this.clientKey,
    required this.questionId,
    required this.userAnswer,
    required this.isCorrect,
    required this.answeredAt,
    this.durationMs,
  });
}

/// 一个待同步的本地练习会话（按 local_id 聚合）。
class PendingSession {
  final String localId;
  final String mode;
  final List<PendingAnswer> answers;

  const PendingSession({
    required this.localId,
    required this.mode,
    required this.answers,
  });
}

/// 离线刷题的本地存储层：题目缓存、本地会话、待同步作答、同步游标。
///
/// 生产环境使用 [LocalDb.instance]；测试可通过构造参数注入数据库 Future。
class LocalPracticeStore {
  LocalPracticeStore({Future<Database>? db}) : _injectedDb = db;

  final Future<Database>? _injectedDb;

  /// 刚作答的答案保留 5 秒缓冲，避免 flush 抢走仍在作答中的会话。
  static const int _syncGraceMs = 5000;

  Future<Database> _resolveDb() {
    final injected = _injectedDb;
    if (injected != null) {
      return injected;
    }
    return LocalDb.instance.database;
  }

  /// 全量覆盖式缓存题目（按 id upsert）。
  ///
  /// [Question.id] 是 String，非数字 ID 无法写入 INTEGER 主键，直接抛错。
  Future<void> cacheQuestions(List<Question> questions) async {
    if (questions.isEmpty) {
      return;
    }
    final db = await _resolveDb();
    final fetchedAt = DateTime.now().millisecondsSinceEpoch;
    final batch = db.batch();
    for (final question in questions) {
      final id = int.tryParse(question.id);
      if (id == null) {
        throw ArgumentError.value(
          question.id,
          'question.id',
          '非数字 ID 无法离线缓存',
        );
      }
      batch.insert(
        'cached_questions',
        <String, Object?>{
          'id': id,
          'content': question.content,
          'options': jsonEncode(question.options),
          'type': question.type,
          'tags': jsonEncode(question.tags),
          'answer': question.answer,
          'explanation': question.explanation,
          'fetched_at': fetchedAt,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  /// 缓存最长可用天数。超过这个时间未联网刷新，就不再拿旧题面判分：
  /// 题目可能在后台被改过（错字、答案更正），用旧答案判对错会污染掌握度。
  static const int cacheMaxAgeDays = 7;

  /// 从缓存随机抽题；[tag] 用 JSON 引号包裹后 LIKE 匹配，避免子串误命中。
  ///
  /// 只返回 [cacheMaxAgeDays] 内拿到的题；全部过期时返回空列表，
  /// 由调用方转成「请联网同步题库」的明确提示，而不是静默用旧答案。
  Future<List<Question>> pickRandom({
    int limit = 10,
    String? tag,
    int maxAgeDays = cacheMaxAgeDays,
  }) async {
    final db = await _resolveDb();
    final cutoff = DateTime.now().millisecondsSinceEpoch -
        Duration(days: maxAgeDays).inMilliseconds;
    final rows = await db.query(
      'cached_questions',
      // answer 为空/空串的题不能离线出：判分只能回退成空答案，会把作答全判错。
      where: tag == null
          ? "fetched_at >= ? AND answer IS NOT NULL AND answer != ''"
          : "fetched_at >= ? AND tags LIKE ? AND answer IS NOT NULL AND answer != ''",
      whereArgs: tag == null
          ? <Object?>[cutoff]
          : <Object?>[cutoff, '%"$tag"%'],
      orderBy: 'RANDOM()',
      limit: limit,
    );
    final questions = <Question>[];
    for (final row in rows) {
      questions.add(_rowToQuestion(row));
    }
    return questions;
  }

  /// 按 ID 取单题（离线判分用）。找不到、或缓存超过 [cacheMaxAgeDays] 返回 null。
  ///
  /// 新鲜度检查与 [pickRandom] 保持一致：断网续练同样不能拿旧题面判分。
  Future<Question?> questionById(String id, {int maxAgeDays = cacheMaxAgeDays}) async {
    final numericId = int.tryParse(id);
    if (numericId == null) {
      return null;
    }
    final db = await _resolveDb();
    final cutoff = DateTime.now().millisecondsSinceEpoch -
        Duration(days: maxAgeDays).inMilliseconds;
    final rows = await db.query(
      'cached_questions',
      where: 'id = ? AND fetched_at >= ?',
      whereArgs: <Object?>[numericId, cutoff],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return _rowToQuestion(rows.first);
  }

  Future<int> cachedQuestionCount() async {
    final db = await _resolveDb();
    final rows = await db.rawQuery('SELECT COUNT(*) AS c FROM cached_questions');
    if (rows.isEmpty) {
      return 0;
    }
    return rows.first['c'] as int? ?? 0;
  }

  /// 确保某个 localId 在 local_sessions 里存在（中途断网时补建，幂等）。
  ///
  /// 幂等键用 `local_<服务端sessionId>`：同一场练习只会补交一次，
  /// 重试不会在服务端重复建会话。
  Future<void> ensureLocalSession({
    required String localId,
    required String userId,
    required String mode,
    required List<String> questionIds,
  }) async {
    final db = await _resolveDb();
    await db.insert(
      'local_sessions',
      <String, Object?>{
        'local_id': localId,
        'user_id': userId,
        'mode': mode,
        'question_ids': jsonEncode(questionIds),
        'started_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  /// 创建本地会话，返回 localId（同时作为同步幂等键 sessionKey）。
  Future<String> createLocalSession({
    required String userId,
    required String mode,
    required List<String> questionIds,
  }) async {
    final db = await _resolveDb();
    final localId = 'local_${DateTime.now().microsecondsSinceEpoch}';
    await db.insert(
      'local_sessions',
      <String, Object?>{
        'local_id': localId,
        'user_id': userId,
        'mode': mode,
        'question_ids': jsonEncode(questionIds),
        'started_at': DateTime.now().millisecondsSinceEpoch,
      },
    );
    return localId;
  }

  /// 记录一次作答；同一 (localId, questionId) 重复作答覆盖旧记录。
  Future<void> recordAnswer({
    required String localId,
    required String userId,
    required String questionId,
    String? userAnswer,
    required bool isCorrect,
    int? durationMs,
  }) async {
    final questionIdInt = int.tryParse(questionId);
    if (questionIdInt == null) {
      throw ArgumentError.value(
        questionId,
        'questionId',
        '非数字 ID 无法离线记录',
      );
    }
    final db = await _resolveDb();
    await db.insert(
      'pending_answers',
      <String, Object?>{
        'client_key': '$localId:$questionIdInt',
        'local_id': localId,
        'user_id': userId,
        'question_id': questionIdInt,
        'user_answer': userAnswer,
        'is_correct': isCorrect ? 1 : 0,
        'duration_ms': durationMs,
        'answered_at': DateTime.now().millisecondsSinceEpoch,
        'synced_at': null,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// 待同步会话：按 local_id 分组，只取 synced_at IS NULL
  /// 且 answered_at 早于 now-5s 的记录（见 [_syncGraceMs]）。
  Future<List<PendingSession>> pendingSessions({required String userId}) async {
    final db = await _resolveDb();
    final cutoff = DateTime.now().millisecondsSinceEpoch - _syncGraceMs;
    final rows = await db.query(
      'pending_answers',
      where: 'synced_at IS NULL AND answered_at < ? AND user_id = ?',
      whereArgs: <Object?>[cutoff, userId],
      orderBy: 'answered_at',
    );
    final sessionRows = await db.query(
      'local_sessions',
      where: 'user_id = ?',
      whereArgs: <Object?>[userId],
    );
    final modeByLocalId = <String, String>{};
    for (final row in sessionRows) {
      final localId = row['local_id'];
      final mode = row['mode'];
      if (localId is String && mode is String) {
        modeByLocalId[localId] = mode;
      }
    }

    final answersByLocalId = <String, List<PendingAnswer>>{};
    final orderedLocalIds = <String>[];
    for (final row in rows) {
      final localId = row['local_id'] as String;
      if (!answersByLocalId.containsKey(localId)) {
        answersByLocalId[localId] = <PendingAnswer>[];
        orderedLocalIds.add(localId);
      }
      answersByLocalId[localId]!.add(
        PendingAnswer(
          clientKey: row['client_key'] as String,
          questionId: row['question_id'] as int,
          userAnswer: row['user_answer'] as String?,
          isCorrect: (row['is_correct'] as int? ?? 0) != 0,
          answeredAt: row['answered_at'] as int? ?? 0,
          durationMs: row['duration_ms'] as int?,
        ),
      );
    }

    return <PendingSession>[
      for (final localId in orderedLocalIds)
        PendingSession(
          localId: localId,
          mode: modeByLocalId[localId] ?? 'random',
          answers: answersByLocalId[localId] ?? const <PendingAnswer>[],
        ),
    ];
  }

  /// 只把「本次请求实际带上的作答」标记为已同步。
  ///
  /// 不能按 local_id 整片标记：请求期间新增/被宽限期跳过的作答并未上传，
  /// 一起标记会让它们永远不再重试（静默丢数据）。
  Future<void> markAnswersSynced(List<String> clientKeys) async {
    if (clientKeys.isEmpty) {
      return;
    }
    final db = await _resolveDb();
    final syncedAt = DateTime.now().millisecondsSinceEpoch;
    final placeholders = List<String>.filled(clientKeys.length, '?').join(',');
    await db.rawUpdate(
      'UPDATE pending_answers SET synced_at = ? '
      'WHERE synced_at IS NULL AND client_key IN ($placeholders)',
      <Object?>[syncedAt, ...clientKeys],
    );
  }

  /// 记录服务端返回的会话 id（用于排查；客户端不依赖它）。
  Future<void> markLocalSessionServerId(
    String localId,
    String? serverSessionId,
  ) async {
    if (serverSessionId == null) {
      return;
    }
    final db = await _resolveDb();
    await db.update(
      'local_sessions',
      <String, Object?>{'synced_session_id': serverSessionId},
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
    );
  }
  /// 未同步的作答条数（按 pending_answers 行计，非会话数）。
  Future<int> pendingCount() async {
    final db = await _resolveDb();
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM pending_answers WHERE synced_at IS NULL',
    );
    if (rows.isEmpty) {
      return 0;
    }
    return rows.first['c'] as int? ?? 0;
  }

  Future<void> setMeta(String key, String value) async {
    final db = await _resolveDb();
    await db.insert(
      'sync_meta',
      <String, Object?>{'key': key, 'value': value},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<String?> getMeta(String key) async {
    final db = await _resolveDb();
    final rows = await db.query(
      'sync_meta',
      where: 'key = ?',
      whereArgs: <Object?>[key],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return rows.first['value'] as String?;
  }

  Question _rowToQuestion(Map<String, Object?> row) {
    // cached_questions 未存 dimension（任务规格如此），离线重建的该字段为 null。
    return Question(
      id: (row['id'] as int).toString(),
      content: row['content'] as String,
      options:
          List<String>.from(jsonDecode(row['options'] as String) as List<dynamic>),
      type: (row['type'] as String?) ?? 'single',
      tags: List<String>.from(
        jsonDecode(row['tags'] as String? ?? '[]') as List<dynamic>,
      ),
      explanation: row['explanation'] as String?,
      answer: row['answer'] as String?,
    );
  }
}
