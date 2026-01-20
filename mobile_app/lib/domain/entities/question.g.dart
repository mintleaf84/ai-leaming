// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Question _$QuestionFromJson(Map<String, dynamic> json) => _Question(
  id: (json['id'] as num).toInt(),
  content: json['content'] as String,
  options: (json['options'] as List<dynamic>).map((e) => e as String).toList(),
  type: json['type'] as String? ?? 'single',
  answer: json['answer'] as String?,
);

Map<String, dynamic> _$QuestionToJson(_Question instance) => <String, dynamic>{
  'id': instance.id,
  'content': instance.content,
  'options': instance.options,
  'type': instance.type,
  'answer': instance.answer,
};

_PracticeSessionResponse _$PracticeSessionResponseFromJson(
  Map<String, dynamic> json,
) => _PracticeSessionResponse(
  sessionId: json['sessionId'] as String,
  questions: (json['questions'] as List<dynamic>)
      .map((e) => Question.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PracticeSessionResponseToJson(
  _PracticeSessionResponse instance,
) => <String, dynamic>{
  'sessionId': instance.sessionId,
  'questions': instance.questions,
};
