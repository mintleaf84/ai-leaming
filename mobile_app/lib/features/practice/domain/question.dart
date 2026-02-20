import 'package:freezed_annotation/freezed_annotation.dart';

part 'question.freezed.dart';
part 'question.g.dart';

/// 题目实体 - 用于答题页面展示
@freezed
abstract class Question with _$Question {
  const factory Question({
    required int id,
    required String content,
    required List<String> options,
    @Default('single') String type, // 'single', 'multiple', 'truefalse'
    String? answer, // 正确答案 (提交后才有)
  }) = _Question;

  factory Question.fromJson(Map<String, dynamic> json) =>
      _$QuestionFromJson(json);
}

/// 练习会话响应
@freezed
abstract class PracticeSessionResponse with _$PracticeSessionResponse {
  const factory PracticeSessionResponse({
    required String sessionId,
    required List<Question> questions,
  }) = _PracticeSessionResponse;

  factory PracticeSessionResponse.fromJson(Map<String, dynamic> json) =>
      _$PracticeSessionResponseFromJson(json);
}
