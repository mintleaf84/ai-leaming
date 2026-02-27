import 'package:freezed_annotation/freezed_annotation.dart';

// 强制将后端的 ID（可能为 int）转换为 String
class StringIdConverter implements JsonConverter<String, dynamic> {
  const StringIdConverter();

  @override
  String fromJson(dynamic json) => json.toString();

  @override
  dynamic toJson(String object) => object;
}
