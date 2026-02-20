import 'package:freezed_annotation/freezed_annotation.dart';

part 'first_principles_params.freezed.dart';
part 'first_principles_params.g.dart';

@freezed
abstract class FirstPrinciplesParams with _$FirstPrinciplesParams {
  const factory FirstPrinciplesParams({
    required String questionContent,
    required String correctAnswer,
    String? explanation,
    String? wrongAnswer,
  }) = _FirstPrinciplesParams;

  factory FirstPrinciplesParams.fromJson(Map<String, dynamic> json) =>
      _$FirstPrinciplesParamsFromJson(json);
}
