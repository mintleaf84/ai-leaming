import 'package:freezed_annotation/freezed_annotation.dart';
import '../../../core/utils/json_converters.dart';

part 'question.freezed.dart';
part 'question.g.dart';

@freezed
abstract class Question with _$Question {
  const factory Question({
    @StringIdConverter() required String id,
    required String content,
    required List<String> options,
    @Default('single') String type,
    @Default([]) List<String> tags,
    String? dimension,
    String? explanation,
    String? answer,
  }) = _Question;

  factory Question.fromJson(Map<String, dynamic> json) =>
      _$QuestionFromJson(json);
}

@freezed
abstract class QuestionListResponse with _$QuestionListResponse {
  const factory QuestionListResponse({
    required List<Question> items,
    required int total,
  }) = _QuestionListResponse;

  factory QuestionListResponse.fromJson(Map<String, dynamic> json) =>
      _$QuestionListResponseFromJson(json);
}
