import 'dart:convert';

import 'practice_resume.dart';

/// 换机备份（§30 P2）的格式、解析与导入结果。
///
/// 只装**不可重建**的数据：
/// - `pendingAnswers`：还没同步到服务端的作答（丢了就永久没了）；
/// - `localSessions`：离线会话（丢了作答就失去归属）；
/// - `resume`：没做完的练习断点；
/// - `settings`：主题/复习模式（可重设，但顺手带走省事）。
///
/// **不含** `cached_questions`：题库能联网重建，带上会让备份从 KB 级涨到 MB 级，
/// 还要处理 schema 版本（见 §30.2 的 P3，明确不做）。
///
/// 也**不含** token、密码、题干正文：备份里只有题号/对错/时长这类作答事实。
class PracticeBackup {
  const PracticeBackup({
    required this.exportedAt,
    required this.userId,
    required this.pendingAnswers,
    required this.localSessions,
    this.resume,
    this.settings = const <String, String>{},
    this.version = currentVersion,
  });

  /// 当前格式版本。不兼容变更时才 +1；导入端只认这一个值。
  static const int currentVersion = 1;

  /// 导出时间（ISO8601），只用于展示/排查，不参与校验。
  final DateTime exportedAt;

  /// 备份归属的账号 id（`TokenUtil.userIdOf(jwt_token)`）。
  ///
  /// 导入时**必须**与当前登录账号一致：`pending_answers` 是按 user_id 隔离的，
  /// 把 A 的作答塞进 B 的库，flush 时会带着 B 的凭据上传（跨账号串数据）。
  final String userId;

  final List<BackupAnswer> pendingAnswers;
  final List<BackupLocalSession> localSessions;

  /// 断点。导出时已按账号过滤；导入时再校验一次归属。
  final PracticeResume? resume;

  /// 允许导入的设置项（白名单在 `PracticeBackupService` 里）。
  final Map<String, String> settings;

  final int version;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'version': version,
    'exportedAt': exportedAt.toIso8601String(),
    'userId': userId,
    'pendingAnswers': <Map<String, dynamic>>[
      for (final answer in pendingAnswers) answer.toJson(),
    ],
    'localSessions': <Map<String, dynamic>>[
      for (final session in localSessions) session.toJson(),
    ],
    'resume': resume?.toJson(),
    'settings': settings,
  };

  String encode() => jsonEncode(toJson());

  /// 解析剪贴板文本；任何结构问题都返回可读错误，**不抛异常**。
  ///
  /// 单条作答/会话字段不合法时只丢那一条（用户在剪贴板里手改过、或旧版本
  /// 少字段），不让整份备份作废——能救多少救多少，但账号与版本必须对。
  static BackupParseResult parse(String raw) {
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return BackupParseResult.failure('备份内容不是合法的 JSON');
    }
    if (decoded is! Map) {
      return BackupParseResult.failure('备份内容不是 JSON 对象');
    }

    final version = decoded['version'];
    if (version is! int || version != currentVersion) {
      return BackupParseResult.failure('备份版本不支持（${version ?? '缺失'}）');
    }

    final userId = decoded['userId'];
    if (userId is! String || userId.trim().isEmpty) {
      return BackupParseResult.failure('备份里没有账号信息，已拒绝导入');
    }

    final answers = <BackupAnswer>[];
    final rawAnswers = decoded['pendingAnswers'];
    if (rawAnswers is List) {
      for (final item in rawAnswers) {
        final answer = BackupAnswer.fromJson(item);
        if (answer != null) {
          answers.add(answer);
        }
      }
    }

    final sessions = <BackupLocalSession>[];
    final rawSessions = decoded['localSessions'];
    if (rawSessions is List) {
      for (final item in rawSessions) {
        final session = BackupLocalSession.fromJson(item);
        if (session != null) {
          sessions.add(session);
        }
      }
    }

    final rawResume = decoded['resume'];
    final PracticeResume? resume;
    if (rawResume is Map) {
      // 断点结构由 PracticeResume 自己校验：不成立就当作「没有断点」。
      resume = PracticeResume.fromJson(Map<String, dynamic>.from(rawResume));
    } else {
      resume = null;
    }

    final settings = <String, String>{};
    final rawSettings = decoded['settings'];
    if (rawSettings is Map) {
      for (final entry in rawSettings.entries) {
        final key = entry.key;
        final value = entry.value;
        if (key is String && key.isNotEmpty && value is String) {
          settings[key] = value;
        }
      }
    }

    return BackupParseResult.ok(
      PracticeBackup(
        version: version,
        exportedAt:
            DateTime.tryParse(decoded['exportedAt']?.toString() ?? '') ??
            DateTime.now(),
        userId: userId,
        pendingAnswers: answers,
        localSessions: sessions,
        resume: resume,
        settings: settings,
      ),
    );
  }
}

/// 一次待同步作答（备份用）。
class BackupAnswer {
  const BackupAnswer({
    required this.clientKey,
    required this.localId,
    required this.questionId,
    required this.isCorrect,
    required this.answeredAt,
    this.userAnswer,
    this.durationMs,
  });

  /// 幂等键：`<localId>:<questionId>`。导入时按它判重（已存在就跳过）。
  final String clientKey;
  final String localId;
  final int questionId;
  final String? userAnswer;
  final bool isCorrect;
  final int? durationMs;

  /// 作答时间（毫秒）。用于构造同步批次幂等键，必须原样保留。
  final int answeredAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'clientKey': clientKey,
    'localId': localId,
    'questionId': questionId,
    'userAnswer': userAnswer,
    'isCorrect': isCorrect,
    'durationMs': durationMs,
    'answeredAt': answeredAt,
  };

  static BackupAnswer? fromJson(Object? json) {
    if (json is! Map) return null;
    final clientKey = json['clientKey'];
    final localId = json['localId'];
    final questionId = json['questionId'];
    final isCorrect = json['isCorrect'];
    final answeredAt = json['answeredAt'];
    if (clientKey is! String || clientKey.trim().isEmpty) return null;
    if (localId is! String || localId.trim().isEmpty) return null;
    if (questionId is! int || questionId <= 0) return null;
    // 服务端判分口径要求 isCorrect 是 bool；字符串 "true" 不接受（宁可丢一条）。
    if (isCorrect is! bool) return null;
    if (answeredAt is! int || answeredAt <= 0) return null;

    final userAnswer = json['userAnswer'];
    final durationMs = json['durationMs'];
    return BackupAnswer(
      clientKey: clientKey,
      localId: localId,
      questionId: questionId,
      userAnswer: userAnswer is String ? userAnswer : null,
      isCorrect: isCorrect,
      durationMs: durationMs is int ? durationMs : null,
      answeredAt: answeredAt,
    );
  }

  /// 从 `pending_answers` 行构造（导出用）。
  static BackupAnswer? fromRow(Map<String, Object?> row) {
    final clientKey = row['client_key'];
    final localId = row['local_id'];
    final questionId = row['question_id'];
    final answeredAt = row['answered_at'];
    if (clientKey is! String || clientKey.isEmpty) return null;
    if (localId is! String || localId.isEmpty) return null;
    if (questionId is! int) return null;
    if (answeredAt is! int) return null;
    return BackupAnswer(
      clientKey: clientKey,
      localId: localId,
      questionId: questionId,
      userAnswer: row['user_answer'] as String?,
      isCorrect: (row['is_correct'] as int? ?? 0) != 0,
      durationMs: row['duration_ms'] as int?,
      answeredAt: answeredAt,
    );
  }
}

/// 一场本地练习（备份用）。
class BackupLocalSession {
  const BackupLocalSession({
    required this.localId,
    required this.mode,
    required this.questionIds,
    required this.startedAt,
    this.syncedSessionId,
  });

  final String localId;
  final String mode;
  final List<String> questionIds;
  final int startedAt;

  /// 服务端返回的会话 id（仅排查用）。
  final String? syncedSessionId;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'localId': localId,
    'mode': mode,
    'questionIds': questionIds,
    'startedAt': startedAt,
    'syncedSessionId': syncedSessionId,
  };

  static BackupLocalSession? fromJson(Object? json) {
    if (json is! Map) return null;
    final localId = json['localId'];
    final mode = json['mode'];
    final rawIds = json['questionIds'];
    final startedAt = json['startedAt'];
    if (localId is! String || localId.trim().isEmpty) return null;
    if (startedAt is! int || startedAt <= 0) return null;
    if (rawIds is! List) return null;
    final questionIds = <String>[
      for (final id in rawIds)
        if (id is String && id.isNotEmpty) id,
    ];
    // 题序是恢复离线练习的唯一依据；空题序的会话导入进来只会变成一个必然
    // 「找不到这场练习」的死会话，直接丢弃。
    if (questionIds.isEmpty) return null;
    final syncedSessionId = json['syncedSessionId'];
    return BackupLocalSession(
      localId: localId,
      mode: mode is String && mode.isNotEmpty ? mode : 'random',
      questionIds: questionIds,
      startedAt: startedAt,
      syncedSessionId: syncedSessionId is String && syncedSessionId.isNotEmpty
          ? syncedSessionId
          : null,
    );
  }

  static BackupLocalSession? fromRow(Map<String, Object?> row) {
    final localId = row['local_id'];
    final mode = row['mode'];
    final rawIds = row['question_ids'];
    final startedAt = row['started_at'];
    if (localId is! String || localId.isEmpty) return null;
    if (startedAt is! int) return null;
    List<String> questionIds = const <String>[];
    if (rawIds is String && rawIds.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawIds);
        if (decoded is List) {
          questionIds = <String>[
            for (final id in decoded)
              if (id != null) id.toString(),
          ];
        }
      } on FormatException {
        // 坏行不导出：导出一份读不回来的会话没有意义。
        return null;
      }
    }
    if (questionIds.isEmpty) return null;
    return BackupLocalSession(
      localId: localId,
      mode: mode is String && mode.isNotEmpty ? mode : 'random',
      questionIds: questionIds,
      startedAt: startedAt,
      syncedSessionId: row['synced_session_id'] as String?,
    );
  }
}

/// 解析结果：二选一（backup 或 error）。
class BackupParseResult {
  const BackupParseResult._({this.backup, this.error});

  factory BackupParseResult.ok(PracticeBackup backup) =>
      BackupParseResult._(backup: backup);

  factory BackupParseResult.failure(String error) =>
      BackupParseResult._(error: error);

  final PracticeBackup? backup;
  final String? error;

  bool get isOk => backup != null;
}

/// 导入结果：新增/跳过条数，或拒绝原因。
///
/// `added` / `skipped` 只统计**数据行**（作答 + 本地会话）；断点与设置单独
/// 标记，不混进条数里——否则「新增 1」会让人以为是多了一条作答。
class BackupImportResult {
  const BackupImportResult({
    this.addedAnswers = 0,
    this.skippedAnswers = 0,
    this.addedSessions = 0,
    this.skippedSessions = 0,
    this.resumeImported = false,
    this.settingsImported = false,
    this.rejection,
  });

  const BackupImportResult.rejected(String reason)
    : addedAnswers = 0,
      skippedAnswers = 0,
      addedSessions = 0,
      skippedSessions = 0,
      resumeImported = false,
      settingsImported = false,
      rejection = reason;

  final int addedAnswers;
  final int skippedAnswers;
  final int addedSessions;
  final int skippedSessions;
  final bool resumeImported;
  final bool settingsImported;

  /// 非 null 表示整份备份被拒绝（版本/账号/JSON 问题）。
  final String? rejection;

  bool get rejected => rejection != null;

  int get added => addedAnswers + addedSessions;

  int get skipped => skippedAnswers + skippedSessions;

  /// 结束报告：`新增 N / 跳过 M`。
  String get summary => '新增 $added / 跳过 $skipped';
}
