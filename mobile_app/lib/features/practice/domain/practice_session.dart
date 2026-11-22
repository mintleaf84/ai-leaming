import 'package:freezed_annotation/freezed_annotation.dart';
import 'question.dart';

part 'practice_session.freezed.dart';
part 'practice_session.g.dart';

@freezed
abstract class PracticeSession with _$PracticeSession {
  const factory PracticeSession({
    required String sessionId,
    required List<Question> questions,

    /// 这一场的练习模式（`practice_sessions.practice_mode`）。
    ///
    /// 服务端 `GET /practice/session/:id` 会返回 `practiceMode`；老会话可能没有，
    /// 所以是可空的。断点续练/错题本入口靠它恢复真实模式——只靠调用方传参，
    /// 断点就会被记成 `random`（数据脏，不只是显示错）。
    String? practiceMode,
  }) = _PracticeSession;

  factory PracticeSession.fromJson(Map<String, dynamic> json) =>
      _$PracticeSessionFromJson(json);
}
