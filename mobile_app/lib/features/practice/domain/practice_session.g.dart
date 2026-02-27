// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PracticeSession _$PracticeSessionFromJson(Map<String, dynamic> json) =>
    _PracticeSession(
      sessionId: json['sessionId'] as String,
      questions: (json['questions'] as List<dynamic>)
          .map((e) => Question.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PracticeSessionToJson(_PracticeSession instance) =>
    <String, dynamic>{
      'sessionId': instance.sessionId,
      'questions': instance.questions,
    };
