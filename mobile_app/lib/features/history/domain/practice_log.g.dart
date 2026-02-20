// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_log.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PracticeLog _$PracticeLogFromJson(Map<String, dynamic> json) => _PracticeLog(
  questionId: (json['questionId'] as num).toInt(),
  questionContent: json['questionContent'] as String,
  options: (json['options'] as List<dynamic>).map((e) => e as String).toList(),
  correctAnswer: json['correctAnswer'] as String,
  userAnswer: json['userAnswer'] as String,
  isCorrect: json['isCorrect'] as bool,
  duration: (json['duration'] as num).toInt(),
  tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
  explanation: json['explanation'] as String,
  aiMnemonic: json['aiMnemonic'] as String?,
);

Map<String, dynamic> _$PracticeLogToJson(_PracticeLog instance) =>
    <String, dynamic>{
      'questionId': instance.questionId,
      'questionContent': instance.questionContent,
      'options': instance.options,
      'correctAnswer': instance.correctAnswer,
      'userAnswer': instance.userAnswer,
      'isCorrect': instance.isCorrect,
      'duration': instance.duration,
      'tags': instance.tags,
      'explanation': instance.explanation,
      'aiMnemonic': instance.aiMnemonic,
    };
