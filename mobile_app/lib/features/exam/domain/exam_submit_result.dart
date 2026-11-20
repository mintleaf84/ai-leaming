import 'exam_json.dart';

/// 把服务端的分数统一成「0–100 的分」。
///
/// 契约里 `practice_sessions.exam_score` 是 `correctCount / totalQuestions`（0–1 的小数），
/// 但列表接口的 `bestScore` 只写了字段名、没写量纲。这里做**一次归一**：
/// 大于 1 的值按「已经是百分制」处理。代价是「正确率恰好 1%（0.01）」与
/// 「1 分（1.0）」在极端边界上不可区分——但 1 分与 100 分都显示为 1，不会出现
/// `8500 分` 这种一眼假的数字。
double examScorePercent(double? raw) {
  if (raw == null || raw.isNaN) return 0;
  final percent = raw <= 1 ? raw * 100 : raw;
  return percent.clamp(0, 100);
}

/// 逐题结果（交卷响应的 `perQuestion[]`）。
class ExamQuestionResult {
  final int questionId;
  final bool isCorrect;

  /// 正确答案（交卷后才下发）。
  final String correctAnswer;
  final String? explanation;

  const ExamQuestionResult({
    required this.questionId,
    required this.isCorrect,
    required this.correctAnswer,
    this.explanation,
  });

  factory ExamQuestionResult.fromJson(Map<String, dynamic> json) {
    return ExamQuestionResult(
      questionId: readInt(json['questionId']),
      isCorrect: readBool(json['isCorrect']),
      correctAnswer: readString(json['correctAnswer'] ?? json['answer']),
      explanation: readNullableString(json['explanation']),
    );
  }
}

/// 交卷结果（`POST /attempts/{sessionId}/submit`）。
class ExamSubmitResult {
  /// 服务端原始分数（契约口径是 0–1，读取时已做归一保护）。
  final double score;
  final int correctCount;
  final int totalQuestions;
  final int durationMs;

  /// 超过截止时间多少毫秒；未超时为 0。
  final int overtimeMs;
  final bool overtime;

  /// 这次是重放：服务端没有写库，直接返回了已有的那份结果。
  final bool duplicate;
  final List<ExamQuestionResult> perQuestion;

  const ExamSubmitResult({
    required this.score,
    required this.correctCount,
    required this.totalQuestions,
    required this.durationMs,
    this.overtimeMs = 0,
    this.overtime = false,
    this.duplicate = false,
    this.perQuestion = const [],
  });

  /// 百分制得分（展示用）。
  double get percent => examScorePercent(score);

  int get wrongCount => perQuestion.where((item) => !item.isCorrect).length;

  /// 正确率：以 `totalQuestions` 为分母，避免服务端漏题时把 1/1 显示成 100%。
  double get accuracy {
    if (totalQuestions <= 0) return 0;
    return (correctCount / totalQuestions * 100).clamp(0, 100);
  }

  factory ExamSubmitResult.fromJson(Map<String, dynamic> json) {
    return ExamSubmitResult(
      score: readDouble(json['score']),
      correctCount: readInt(json['correctCount']),
      totalQuestions: readInt(json['totalQuestions']),
      durationMs: readInt(json['durationMs']),
      overtimeMs: readInt(json['overtimeMs']),
      overtime: readBool(json['overtime']),
      duplicate: readBool(json['duplicate']),
      perQuestion: readObjectList(
        json['perQuestion'] ?? json['results'],
        ExamQuestionResult.fromJson,
      ),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'score': score,
    'correctCount': correctCount,
    'totalQuestions': totalQuestions,
    'durationMs': durationMs,
    'overtimeMs': overtimeMs,
    'overtime': overtime,
    'duplicate': duplicate,
    'perQuestion': <Map<String, dynamic>>[
      for (final item in perQuestion)
        <String, dynamic>{
          'questionId': item.questionId,
          'isCorrect': item.isCorrect,
          'correctAnswer': item.correctAnswer,
          'explanation': item.explanation,
        },
    ],
  };
}
