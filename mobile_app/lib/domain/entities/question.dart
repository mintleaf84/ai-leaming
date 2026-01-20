/// 题目实体 - 用于答题页面展示
class Question {
  final int id;
  final String content;
  final List<String> options;
  final String type; // 'single', 'multiple', 'truefalse'
  final String? answer; // 正确答案 (提交后才有)

  Question({
    required this.id,
    required this.content,
    required this.options,
    this.type = 'single',
    this.answer,
  });

  factory Question.fromJson(Map<String, dynamic> json) {
    return Question(
      id: json['id'] as int,
      content: json['content'] as String,
      options: (json['options'] as List<dynamic>).cast<String>(),
      type: json['type'] as String? ?? 'single',
      answer: json['answer'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content': content,
      'options': options,
      'type': type,
      'answer': answer,
    };
  }
}

/// 练习会话响应
class PracticeSessionResponse {
  final String sessionId;
  final List<Question> questions;

  PracticeSessionResponse({required this.sessionId, required this.questions});

  factory PracticeSessionResponse.fromJson(Map<String, dynamic> json) {
    return PracticeSessionResponse(
      sessionId: json['sessionId'] as String,
      questions: (json['questions'] as List<dynamic>)
          .map((q) => Question.fromJson(q as Map<String, dynamic>))
          .toList(),
    );
  }
}
