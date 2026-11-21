/// 学习统计数据模型
class LearningStats {
  final int todayCount;
  final int todayCorrect;
  final double todayAccuracy;
  final int totalCount;
  final int totalCorrect;
  final double overallAccuracy;
  final int streakDays;
  final int totalSessions;

  const LearningStats({
    required this.todayCount,
    required this.todayCorrect,
    required this.todayAccuracy,
    required this.totalCount,
    required this.totalCorrect,
    required this.overallAccuracy,
    required this.streakDays,
    required this.totalSessions,
  });

  factory LearningStats.fromJson(Map<String, dynamic> json) {
    return LearningStats(
      todayCount: (json['todayCount'] as num).toInt(),
      todayCorrect: (json['todayCorrect'] as num).toInt(),
      todayAccuracy: (json['todayAccuracy'] as num).toDouble(),
      totalCount: (json['totalCount'] as num).toInt(),
      totalCorrect: (json['totalCorrect'] as num).toInt(),
      overallAccuracy: (json['overallAccuracy'] as num).toDouble(),
      streakDays: (json['streakDays'] as num).toInt(),
      totalSessions: (json['totalSessions'] as num).toInt(),
    );
  }

  /// 空数据（初始状态）
  static const empty = LearningStats(
    todayCount: 0,
    todayCorrect: 0,
    todayAccuracy: 0,
    totalCount: 0,
    totalCorrect: 0,
    overallAccuracy: 0,
    streakDays: 0,
    totalSessions: 0,
  );
}
