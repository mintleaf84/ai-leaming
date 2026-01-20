import 'package:freezed_annotation/freezed_annotation.dart';

part 'first_principles_response.freezed.dart';
part 'first_principles_response.g.dart';

@freezed
abstract class FirstPrinciplesResponse with _$FirstPrinciplesResponse {
  const factory FirstPrinciplesResponse({
    required String analysis,
    required bool cached,
  }) = _FirstPrinciplesResponse;

  factory FirstPrinciplesResponse.fromJson(Map<String, dynamic> json) =>
      _$FirstPrinciplesResponseFromJson(json);
}
