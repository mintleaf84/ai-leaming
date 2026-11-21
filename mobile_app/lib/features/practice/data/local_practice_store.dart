import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';

import '../../../core/local/local_db.dart';
import '../domain/practice_backup.dart';
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

  /// 按 ID 取单题（离线判分/离线续练用）。找不到、缓存过期、**或没有答案**时返回 null。
  ///
  /// 新鲜度与「必须有答案」两条检查都与 [pickRandom] 保持一致：缓存可能被
  /// `cacheQuestions` 用 `answer=null` 覆盖（服务端列表接口不带答案），
  /// 拿这种题续练会在提交时用空答案判分，把用户做对的题全判错。
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
      where: "id = ? AND fetched_at >= ? AND answer IS NOT NULL AND answer != ''",
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

  /// 取某个本地会话的题目 id 列表（离线续练用）；找不到返回 null。
  ///
  /// 离线会话（`local_` 前缀）没有服务端记录，重启后只能靠 local_sessions 里
  /// 这份 question_ids + 题目缓存重建——否则「继续上次练习」会打到一个必然
  /// 404 的地址上。
  Future<List<String>?> localSessionQuestionIds(String localId) async {
    final db = await _resolveDb();
    final rows = await db.query(
      'local_sessions',
      columns: <String>['question_ids'],
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final raw = rows.first['question_ids'];
    if (raw is! String || raw.isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return null;
      return <String>[for (final id in decoded) id.toString()];
    } catch (error) {
      debugPrint('[Practice] 本地会话题目解析失败: $error');
      return null;
    }
  }

  /// 某个本地会话的归属账号；会话不存在（或没写 user_id）时返回 null。
  ///
  /// 离线续练必须先比对归属：`local_sessions` 是按设备共享的，退出登录并不会
  /// 清掉上一位用户的会话，不校验就会出现「B 能接着做 A 的离线练习」。
  Future<String?> localSessionOwner(String localId) async {
    final db = await _resolveDb();
    final rows = await db.query(
      'local_sessions',
      columns: <String>['user_id'],
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final owner = rows.first['user_id'];
    return owner is String && owner.isNotEmpty ? owner : null;
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

  /// 把整库题目的 `fetched_at` 统一成同一个时间戳（题库预下载完成时用）。
  ///
  /// 为什么必须统一：`cacheQuestions` 每页各写一次 `now`，逐页刷新会让
  /// 「先下的页」在整库下完时就已接近 7 天过期线，用户明明刚下完却抽不到题。
  /// 整库完成即代表「这一版题库全部是同一时刻拿到的」，时间戳也只能有一个。
  Future<void> markAllQuestionsFetchedAt(int fetchedAt) async {
    final db = await _resolveDb();
    await db.update(
      'cached_questions',
      <String, Object?>{'fetched_at': fetchedAt},
    );
  }

  /// 某账号的待同步作答（备份导出用）。
  ///
  /// 不过滤 5 秒宽限期：换机前导出的必须是**全部**未同步记录，
  /// 刚作答的那几条同样会随设备一起消失。
  Future<List<BackupAnswer>> unsyncedAnswersFor(String userId) async {
    final db = await _resolveDb();
    final rows = await db.query(
      'pending_answers',
      where: 'synced_at IS NULL AND user_id = ?',
      whereArgs: <Object?>[userId],
      orderBy: 'answered_at',
    );
    return <BackupAnswer>[
      for (final row in rows)
        if (BackupAnswer.fromRow(row) case final answer?) answer,
    ];
  }

  /// 某账号的本地练习会话（备份导出用）。
  Future<List<BackupLocalSession>> localSessionsFor(String userId) async {
    final db = await _resolveDb();
    final rows = await db.query(
      'local_sessions',
      where: 'user_id = ?',
      whereArgs: <Object?>[userId],
      orderBy: 'started_at',
    );
    return <BackupLocalSession>[
      for (final row in rows)
        if (BackupLocalSession.fromRow(row) case final session?) session,
    ];
  }

  /// 导入备份作答，返回真正新增的条数。
  ///
  /// 幂等键仍是 `client_key`：已存在的直接跳过（返回计数不含它们）。
  /// 归属一律写成 [userId]（导入前已校验过备份账号与当前登录一致）。
  Future<int> insertBackupAnswers(
    List<BackupAnswer> answers, {
    required String userId,
  }) async {
    if (answers.isEmpty) {
      return 0;
    }
    final db = await _resolveDb();
    final existing = await _existingKeys(
      db,
      table: 'pending_answers',
      column: 'client_key',
      keys: <String>[for (final answer in answers) answer.clientKey],
    );
    final missing = <BackupAnswer>[
      for (final answer in answers)
        if (!existing.contains(answer.clientKey)) answer,
    ];
    if (missing.isEmpty) {
      return 0;
    }
    final batch = db.batch();
    for (final answer in missing) {
      batch.insert(
        'pending_answers',
        <String, Object?>{
          'client_key': answer.clientKey,
          'local_id': answer.localId,
          'user_id': userId,
          'question_id': answer.questionId,
          'user_answer': answer.userAnswer,
          'is_correct': answer.isCorrect ? 1 : 0,
          'duration_ms': answer.durationMs,
          'answered_at': answer.answeredAt,
          // 导入的作答一律视为**未同步**：换机场景下它们本来就还没上传。
          'synced_at': null,
        },
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
    await batch.commit(noResult: true);
    return missing.length;
  }

  /// 导入备份会话，返回真正新增的条数（`local_id` 已存在则跳过）。
  Future<int> insertBackupSessions(
    List<BackupLocalSession> sessions, {
    required String userId,
  }) async {
    if (sessions.isEmpty) {
      return 0;
    }
    final db = await _resolveDb();
    final existing = await _existingKeys(
      db,
      table: 'local_sessions',
      column: 'local_id',
      keys: <String>[for (final session in sessions) session.localId],
    );
    final missing = <BackupLocalSession>[
      for (final session in sessions)
        if (!existing.contains(session.localId)) session,
    ];
    if (missing.isEmpty) {
      return 0;
    }
    final batch = db.batch();
    for (final session in missing) {
      batch.insert(
        'local_sessions',
        <String, Object?>{
          'local_id': session.localId,
          'user_id': userId,
          'mode': session.mode,
          'question_ids': jsonEncode(session.questionIds),
          'started_at': session.startedAt,
          'synced_session_id': session.syncedSessionId,
        },
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
    await batch.commit(noResult: true);
    return missing.length;
  }

  /// 分批查已存在的键（SQLite 的 `IN` 参数个数有上限，不能一次塞几千个）。
  Future<Set<String>> _existingKeys(
    Database db, {
    required String table,
    required String column,
    required List<String> keys,
  }) async {
    const chunkSize = 100;
    final existing = <String>{};
    for (var start = 0; start < keys.length; start += chunkSize) {
      final end = start + chunkSize > keys.length ? keys.length : start + chunkSize;
      final chunk = keys.sublist(start, end);
      final placeholders = List<String>.filled(chunk.length, '?').join(',');
      final rows = await db.rawQuery(
        'SELECT $column AS k FROM $table WHERE $column IN ($placeholders)',
        chunk,
      );
      for (final row in rows) {
        final key = row['k'];
        if (key is String) {
          existing.add(key);
        }
      }
    }
    return existing;
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
    //
    // material / materialHtml 同理不缓存：材料正文动辄上千字，且离线会话只用来
    // 补交答案，展示题干足够。所以离线重建的题**一定**是 material == null &&
    // materialHtml == null——这是「离线没存」而不是「题目本来没材料」，
    // 练习页因此不显示材料卡，也不应据此提示用户「本题无材料」。
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
