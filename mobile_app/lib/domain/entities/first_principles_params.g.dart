// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'first_principles_params.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_FirstPrinciplesParams _$FirstPrinciplesParamsFromJson(
  Map<String, dynamic> json,
) => _FirstPrinciplesParams(
  questionContent: json['questionContent'] as String,
  correctAnswer: json['correctAnswer'] as String,
  explanation: json['explanation'] as String?,
  wrongAnswer: json['wrongAnswer'] as String?,
);

Map<String, dynamic> _$FirstPrinciplesParamsToJson(
  _FirstPrinciplesParams instance,
) => <String, dynamic>{
  'questionContent': instance.questionContent,
  'correctAnswer': instance.correctAnswer,
  'explanation': instance.explanation,
  'wrongAnswer': instance.wrongAnswer,
};
