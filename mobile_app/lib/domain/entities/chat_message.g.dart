// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_message.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ChatMessage _$ChatMessageFromJson(Map<String, dynamic> json) => _ChatMessage(
  id: const StringIdConverter().fromJson(json['id']),
  role: json['role'] as String,
  content: json['content'] as String,
  isFavorite: json['is_favorite'] == null
      ? false
      : _boolFromInt(json['is_favorite']),
);

Map<String, dynamic> _$ChatMessageToJson(_ChatMessage instance) =>
    <String, dynamic>{
      'id': const StringIdConverter().toJson(instance.id),
      'role': instance.role,
      'content': instance.content,
      'is_favorite': instance.isFavorite,
    };
