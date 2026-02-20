// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'history_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_HistoryItem _$HistoryItemFromJson(Map<String, dynamic> json) => _HistoryItem(
  id: json['id'] as String,
  sessionName: json['sessionName'] as String?,
  totalQuestions: (json['totalQuestions'] as num).toInt(),
  correctCount: (json['correctCount'] as num).toInt(),
  reviewCount: (json['reviewCount'] as num?)?.toInt() ?? 0,
  createdAt: json['createdAt'] as String,
  accuracy: (json['accuracy'] as num).toInt(),
  practiceMode: json['practiceMode'] as String?,
);

Map<String, dynamic> _$HistoryItemToJson(_HistoryItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'sessionName': instance.sessionName,
      'totalQuestions': instance.totalQuestions,
      'correctCount': instance.correctCount,
      'reviewCount': instance.reviewCount,
      'createdAt': instance.createdAt,
      'accuracy': instance.accuracy,
      'practiceMode': instance.practiceMode,
    };
