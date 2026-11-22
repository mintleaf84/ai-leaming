import 'dart:convert';

/// 断点里的一条已答记录：题号 + 判分结果。
///
/// 只存这两项就够用：
/// - 题号用来定位「第一道未答题」（恢复位置），
/// - 对错用来回填 `results`，结果页统计才包含恢复前的作答。
///
/// 用户选了什么答案**不**回填：那是服务端会话里的事实，本地再镜像一份只会
/// 制造第二份事实来源（见 `practice_provider.dart` 顶部注释）。
class ResumeAnswer {
  const ResumeAnswer({required this.questionId, required this.isCorrect});

  /// 题目 id（服务端是数字串，本地缓存同样是数字串）。
  final String questionId;

  /// 这道题是否答对。
  final bool isCorrect;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': questionId,
    'correct': isCorrect,
  };

  /// 解析一条已答记录；缺字段/类型不对返回 null（由上层整体判定为坏断点）。
  static ResumeAnswer? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final correct = json['correct'];
    if (id is! String || id.isEmpty || correct is! bool) return null;
    return ResumeAnswer(questionId: id, isCorrect: correct);
  }
}

/// 一场没做完的练习的断点。
///
/// 为什么只存这几项：恢复只需要「回到哪一场、从第几题接着做、已经判过的题
/// 是什么结果」。题目正文、已选答案都在服务端会话里
/// （`GET /practice/session/:id` 会连同题目一起返回），本地再镜像一份只会
/// 制造第二份事实来源。
///
/// 为什么存**已答题号**而不是「已答数」：用户可以跳题作答——已答 2 题时
/// 第 1 题可能还没答，把已答数当下标会落到一道已经判过的题上（服务端会
/// 重复记一次作答），而真正没做的题反而被跳过。恢复位置因此由
/// [nextIndex]（第一道未答题）表达，写入时由控制器按题号算好。
class PracticeResume {
  const PracticeResume({
    required this.sessionId,
    required this.answers,
    required this.nextIndex,
    required this.total,
    this.mode,
    this.userId,
    this.legacyAnswered = 0,
    required this.savedAt,
  });

  /// 服务端会话 id（离线会话是 `local_` 前缀，同样适用）。
  final String sessionId;

  /// 已作答的题目（按作答顺序）：定位未答题、回填结果、显示「已答 N 题」。
  final List<ResumeAnswer> answers;

  /// 恢复后落到的下标 = **第一道未答题**（不是已答数）。
  final int nextIndex;

  /// 本场总题数。
  final int total;

  /// 练习模式（`practice_sessions.practice_mode` 原值）。
  ///
  /// `null` = 不知道这一场是什么模式（老会话没存、入口也没传）：续练时界面
  /// 显示中性「其它练习」，**不**补成 `random` 冒充随机练习。
  final String? mode;

  /// 断点归属的账号 id（`TokenUtil.userIdOf(jwt_token)`）。
  ///
  /// 断点曾经是全局 key：退出登录不清，账号 B 能看到并接着做 A 的练习。
  /// 读取时与当前账号比对，不一致就整份丢弃。
  final String? userId;

  /// 旧格式断点里的「已答数」（顺序作答时的连续前缀）。
  ///
  /// 旧格式只有 `answered`、没有题号，恢复后 `answers` 为空。若照常按
  /// 「第一道未答题」重写断点，`nextIndex` 会退化成 0（进度丢失）。
  /// 这里保留这个前缀，落点时取 `max(第一道未答题, legacyAnswered)`，
  /// 并且用户真正作答后新位置自然越过它。
  final int legacyAnswered;

  /// 最后一次落盘时间。
  final DateTime savedAt;

  /// 已答题数（首页显示进度用）。
  int get answeredCount => answers.length;

  /// 已答题号集合（与题目顺序比对，找第一道未答题）。
  Set<String> get answeredQuestionIds =>
      <String>{for (final answer in answers) answer.questionId};

  /// 从哪一题接着做。保留旧名字：调用点只关心「下一题的下标」。
  int get startIndex => nextIndex;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sessionId': sessionId,
    'answers': <Map<String, dynamic>>[
      for (final answer in answers) answer.toJson(),
    ],
    'nextIndex': nextIndex,
    'total': total,
    if (mode != null) 'mode': mode,
    if (userId != null) 'userId': userId,
    if (legacyAnswered > 0) 'legacyAnswered': legacyAnswered,
    'savedAt': savedAt.toIso8601String(),
  };

  /// 解析断点；任何一项不成立都返回 null（当作「没有断点」）。
  ///
  /// 不做「尽量恢复」：一个 total 为 0、下标越界或已答完的断点，点进去只会
  /// 看到空屏或「已完成」，还不如不显示这个入口。
  ///
  /// 兼容旧格式（只有 `answered` 计数、没有题号）：顺序作答时已答数恰好
  /// 等于下一题下标，按它恢复即可；新写的断点一律带 `answers`。
  static PracticeResume? fromJson(Map<String, dynamic> json) {
    final sessionId = json['sessionId'];
    final total = json['total'];
    if (sessionId is! String || sessionId.isEmpty) return null;
    if (total is! int || total <= 0) return null;

    final rawAnswers = json['answers'];
    final answers = <ResumeAnswer>[];
    if (rawAnswers != null) {
      if (rawAnswers is! List) return null;
      for (final item in rawAnswers) {
        final answer = ResumeAnswer.fromJson(item);
        if (answer == null) return null;
        answers.add(answer);
      }
      // 同一题重复出现说明写入逻辑出了问题：这种断点不可信。
      if (answers.map((a) => a.questionId).toSet().length != answers.length) {
        return null;
      }
    }

    final rawNext = json['nextIndex'];
    final legacyAnsweredRaw = json['answered'];
    final int nextIndex;
    if (rawNext is int) {
      nextIndex = rawNext;
    } else if (rawAnswers == null && legacyAnsweredRaw is int) {
      nextIndex = legacyAnsweredRaw;
    } else {
      return null;
    }

    if (answers.length >= total) return null;
    if (nextIndex < 0 || nextIndex >= total) return null;

    // 旧格式的「已答数」作为连续已答前缀保留下来：没有它，恢复后立即重写
    // 断点会把 nextIndex 覆盖成「第一道未答题」= 0（review 二轮 2）。
    final legacyRaw = json['legacyAnswered'] ?? legacyAnsweredRaw;
    final legacyAnswered = legacyRaw is int && legacyRaw > 0 && legacyRaw < total
        ? legacyRaw
        : 0;

    final mode = json['mode'];
    final userId = json['userId'];
    final savedAt = json['savedAt'];
    return PracticeResume(
      sessionId: sessionId,
      answers: answers,
      nextIndex: nextIndex,
      total: total,
      // 缺失/空值 = 「不知道这一场的模式」，保留 null：补成 `random` 会让
      // 首页续练把一场 AI 题集/试卷练习说成随机（假话，不进备份也不该进断点）。
      mode: mode is String && mode.isNotEmpty ? mode : null,
      userId: userId is String && userId.isNotEmpty ? userId : null,
      legacyAnswered: legacyAnswered,
      savedAt: savedAt is String
          ? DateTime.tryParse(savedAt) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  /// 从本地存储的原始字符串解析（格式漂移/半截写入一律按「没有断点」）。
  static PracticeResume? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return fromJson(decoded);
    } catch (_) {
      return null;
    }
  }
}
