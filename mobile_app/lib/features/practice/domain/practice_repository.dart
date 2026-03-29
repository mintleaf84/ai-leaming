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

  Future<PracticeSession> createSession({required int limit});

  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
  });

  Future<FirstPrinciplesResponse> analyzeFirstPrinciples({
    required String questionId,
    required String content,
  });
}
