import 'dart:convert';

/// 一场没做完的练习的断点。
///
/// 为什么只存这几项：恢复只需要「回到哪一场、从第几题接着做」。
/// 题目正文、已选答案、判分结果都在服务端会话里（`GET /practice/session/:id`
/// 会连同题目一起返回），本地再镜像一份只会制造第二份事实来源。
///
/// 进度用「已答数」而不是下标：已答数是单调的，而用户可能用「上一题」回看，
/// 下标来回跳会让首页显示的进度倒退。
class PracticeResume {
  const PracticeResume({
    required this.sessionId,
    required this.answered,
    required this.total,
    this.mode = 'random',
    required this.savedAt,
  });

  /// 服务端会话 id（离线会话是 `local_` 前缀，同样适用）。
  final String sessionId;

  /// 已作答的题数（= 有判分结果的题数）。
  final int answered;

  /// 本场总题数。
  final int total;

  /// 练习模式（后端目前只支持 `random`，字段留着以免以后换模式时又改一次格式）。
  final String mode;

  /// 最后一次落盘时间。
  final DateTime savedAt;

  /// 从哪一题接着做。
  int get startIndex => answered.clamp(0, total - 1);

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sessionId': sessionId,
    'answered': answered,
    'total': total,
    'mode': mode,
    'savedAt': savedAt.toIso8601String(),
  };

  /// 解析断点；任何一项不成立都返回 null（当作「没有断点」）。
  ///
  /// 不做「尽量恢复」：一个 total 为 0 或 answered ≥ total 的断点，
  /// 点进去只会看到空屏或「已完成」，还不如不显示这个入口。
  static PracticeResume? fromJson(Map<String, dynamic> json) {
    final sessionId = json['sessionId'];
    final answered = json['answered'];
    final total = json['total'];
    if (sessionId is! String || sessionId.isEmpty) return null;
    if (answered is! int || answered < 0) return null;
    if (total is! int || total <= 0 || answered >= total) return null;
    final mode = json['mode'];
    final savedAt = json['savedAt'];
    return PracticeResume(
      sessionId: sessionId,
      answered: answered,
      total: total,
      mode: mode is String && mode.isNotEmpty ? mode : 'random',
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
