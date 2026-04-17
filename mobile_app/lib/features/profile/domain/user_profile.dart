/// 用户信息模型
class UserProfileStats {
  final int totalSessions;
  final int totalAnswered;
  final int totalCorrect;
  final double overallAccuracy;
  final int knowledgeCardCount;
  final int wrongBookCount;

  const UserProfileStats({
    required this.totalSessions,
    required this.totalAnswered,
    required this.totalCorrect,
    required this.overallAccuracy,
    required this.knowledgeCardCount,
    required this.wrongBookCount,
  });

  factory UserProfileStats.fromJson(Map<String, dynamic> json) {
    return UserProfileStats(
      totalSessions: (json['totalSessions'] as num).toInt(),
      totalAnswered: (json['totalAnswered'] as num).toInt(),
      totalCorrect: (json['totalCorrect'] as num).toInt(),
      overallAccuracy: (json['overallAccuracy'] as num).toDouble(),
      knowledgeCardCount: (json['knowledgeCardCount'] as num).toInt(),
      wrongBookCount: (json['wrongBookCount'] as num).toInt(),
    );
  }
}

class UserProfile {
  final int id;
  final String username;
  final String role;
  final String createdAt;
  final UserProfileStats stats;

  const UserProfile({
    required this.id,
    required this.username,
    required this.role,
    required this.createdAt,
    required this.stats,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json['id'] as num).toInt(),
      username: json['username'] as String,
      role: json['role'] as String,
      createdAt: json['createdAt'] as String,
      stats: UserProfileStats.fromJson(
        json['stats'] as Map<String, dynamic>,
      ),
    );
  }
}
