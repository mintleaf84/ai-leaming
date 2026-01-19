import 'package:json_annotation/json_annotation.dart';

part 'auth_request.g.dart';

@JsonSerializable()
class AuthRequest {
  final String username;
  final String password;

  AuthRequest({required this.username, required this.password});

  Map<String, dynamic> toJson() => _$AuthRequestToJson(this);
}
