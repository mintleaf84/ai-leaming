// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Question _$QuestionFromJson(Map<String, dynamic> json) => _Question(
  id: const StringIdConverter().fromJson(json['id']),
  content: json['content'] as String,
  options: (json['options'] as List<dynamic>).map((e) => e as String).toList(),
  type: json['type'] as String? ?? 'single',
  tags:
      (json['tags'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const [],
  dimension: json['dimension'] as String?,
  explanation: json['explanation'] as String?,
  answer: json['answer'] as String?,
);

Map<String, dynamic> _$QuestionToJson(_Question instance) => <String, dynamic>{
  'id': const StringIdConverter().toJson(instance.id),
  'content': instance.content,
  'options': instance.options,
  'type': instance.type,
  'tags': instance.tags,
  'dimension': instance.dimension,
  'explanation': instance.explanation,
  'answer': instance.answer,
};

_QuestionListResponse _$QuestionListResponseFromJson(
  Map<String, dynamic> json,
) => _QuestionListResponse(
  items: (json['items'] as List<dynamic>)
      .map((e) => Question.fromJson(e as Map<String, dynamic>))
      .toList(),
  total: (json['total'] as num).toInt(),
);

Map<String, dynamic> _$QuestionListResponseToJson(
  _QuestionListResponse instance,
) => <String, dynamic>{'items': instance.items, 'total': instance.total};
