import 'question.dart';
import 'practice_session.dart';
import 'first_principles_response.dart';

abstract class PracticeRepository {
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  });

  Future<Question> getQuestionDetail(String id);

  Future<PracticeSession> createSession({required int limit, String mode = 'random'});

  /// 按 sessionId 取回待作答题目（错题本「开始练习」续练用）
  Future<PracticeSession> getSession(String sessionId);

  /// 提交单题作答。
  ///
  /// [sessionQuestionIds] 只在「在线会话中途断网、降级成本地会话」时用到：
  /// 降级会新建 `local_<服务端会话 id>` 这一场，必须把**整场题序**记进本地
  /// 会话，否则重启后续练只能看到断网那一题（题序丢失、进度错位）。
  /// [mode] 同理：降级建的那一场要记住这一场真实的练习模式（不知道就传 null），
  /// 否则续练只有内部标记可读，界面只能显示「其它练习」。
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
    String? mode,
  });

  Future<FirstPrinciplesResponse> analyzeFirstPrinciples({
    required String questionContent,
    required String correctAnswer,
    String? explanation,
    String? wrongAnswer,
  });
}
