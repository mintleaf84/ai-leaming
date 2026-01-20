import 'package:freezed_annotation/freezed_annotation.dart';

part 'practice_log.freezed.dart';
part 'practice_log.g.dart';

/// 练习日志 (题目记录)
@freezed
abstract class PracticeLog with _$PracticeLog {
  const factory PracticeLog({
    required int questionId,
    required String questionContent,
    required List<String> options,
    required String correctAnswer,
    required String userAnswer,
    required bool isCorrect,
    required int duration,
    required List<String> tags,
    required String explanation,
    String? aiMnemonic,
  }) = _PracticeLog;

  factory PracticeLog.fromJson(Map<String, dynamic> json) =>
      _$PracticeLogFromJson(json);
}
