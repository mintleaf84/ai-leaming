import 'package:freezed_annotation/freezed_annotation.dart';

part 'chat_message.freezed.dart';
part 'chat_message.g.dart';

// 强制将后端的 ID（可能为 int）转换为 String
class StringIdConverter implements JsonConverter<String, dynamic> {
  const StringIdConverter();

  @override
  String fromJson(dynamic json) => json.toString();

  @override
  dynamic toJson(String object) => object;
}

@freezed
abstract class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    @StringIdConverter() required String id,
    required String role,
    required String content,
    // ignore: invalid_annotation_target
    @JsonKey(name: 'is_favorite', fromJson: _boolFromInt)
    @Default(false)
    bool isFavorite,
  }) = _ChatMessage;

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);
}

bool _boolFromInt(dynamic value) {
  if (value is int) return value == 1;
  if (value is bool) return value;
  return false;
}
