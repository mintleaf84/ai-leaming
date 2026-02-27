import 'package:freezed_annotation/freezed_annotation.dart';
import 'question.dart';

part 'practice_session.freezed.dart';
part 'practice_session.g.dart';

@freezed
abstract class PracticeSession with _$PracticeSession {
  const factory PracticeSession({
    required String sessionId,
    required List<Question> questions,
  }) = _PracticeSession;

  factory PracticeSession.fromJson(Map<String, dynamic> json) =>
      _$PracticeSessionFromJson(json);
}
