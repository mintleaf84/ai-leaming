// 错题本数据模型

/// 错题项
class WrongQuestion {
  final String questionId;
  final String questionContent;
  final List<String> tags;
  final int wrongCount;
  final String lastWrongAt;
  final String correctAnswer;
  final String userLastAnswer;

  const WrongQuestion({
    required this.questionId,
    required this.questionContent,
    required this.tags,
    required this.wrongCount,
    required this.lastWrongAt,
    required this.correctAnswer,
    required this.userLastAnswer,
  });

  factory WrongQuestion.fromJson(Map<String, dynamic> json) {
    return WrongQuestion(
      questionId: json['questionId'].toString(),
      questionContent: json['questionContent'] as String? ?? '',
      tags:
          (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
          [],
      wrongCount: json['wrongCount'] as int? ?? 0,
      lastWrongAt: json['lastWrongAt'] as String? ?? '',
      correctAnswer: json['correctAnswer'] as String? ?? '',
      userLastAnswer: json['userLastAnswer'] as String? ?? '',
    );
  }
}

/// 按知识点分组
class WrongQuestionsByTag {
  final String tag;
  final int count;
  final List<WrongQuestion> questions;

  const WrongQuestionsByTag({
    required this.tag,
    required this.count,
    required this.questions,
  });

  factory WrongQuestionsByTag.fromJson(Map<String, dynamic> json) {
    return WrongQuestionsByTag(
      tag: json['tag'] as String? ?? '',
      count: json['count'] as int? ?? 0,
      questions:
          (json['questions'] as List<dynamic>?)
              ?.map((e) => WrongQuestion.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

/// 错题统计
class WrongBookStats {
  final int total;
  final int recent;
  final int frequent;

  const WrongBookStats({this.total = 0, this.recent = 0, this.frequent = 0});

  factory WrongBookStats.fromJson(Map<String, dynamic> json) {
    return WrongBookStats(
      total: json['total'] as int? ?? 0,
      recent: json['recent'] as int? ?? 0,
      frequent: json['frequent'] as int? ?? 0,
    );
  }
}

/// 历史作答记录
class HistoryLog {
  final String timestamp;
  final String userAnswer;
  final bool isCorrect;

  const HistoryLog({
    required this.timestamp,
    required this.userAnswer,
    required this.isCorrect,
  });

  factory HistoryLog.fromJson(Map<String, dynamic> json) {
    return HistoryLog(
      timestamp: json['timestamp'] as String? ?? '',
      userAnswer: json['userAnswer'] as String? ?? '',
      isCorrect: json['isCorrect'] as bool? ?? false,
    );
  }
}

/// 错题详情（含选项和历史作答）
class WrongQuestionDetail {
  final String questionId;
  final String questionContent;
  final List<String> options;
  final String correctAnswer;
  final String explanation;
  final List<String> tags;
  final String questionType;
  final int wrongCount;
  final String lastWrongAt;
  final String userLastAnswer;
  final List<HistoryLog> historyLogs;

  const WrongQuestionDetail({
    required this.questionId,
    required this.questionContent,
    required this.options,
    required this.correctAnswer,
    required this.explanation,
    required this.tags,
    required this.questionType,
    required this.wrongCount,
    required this.lastWrongAt,
    required this.userLastAnswer,
    required this.historyLogs,
  });

  factory WrongQuestionDetail.fromJson(Map<String, dynamic> json) {
    return WrongQuestionDetail(
      questionId: json['questionId'].toString(),
      questionContent: json['questionContent'] as String? ?? '',
      options:
          (json['options'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      correctAnswer: json['correctAnswer'] as String? ?? '',
      explanation: json['explanation'] as String? ?? '',
      tags:
          (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
          [],
      questionType: json['questionType'] as String? ?? 'single',
      wrongCount: json['wrongCount'] as int? ?? 0,
      lastWrongAt: json['lastWrongAt'] as String? ?? '',
      userLastAnswer: json['userLastAnswer'] as String? ?? '',
      historyLogs:
          (json['historyLogs'] as List<dynamic>?)
              ?.map((e) => HistoryLog.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
