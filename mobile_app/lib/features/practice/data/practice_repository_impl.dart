import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/practice_repository.dart';
import '../domain/question.dart';
import '../domain/practice_session.dart';
import '../domain/first_principles_response.dart';

final practiceRepositoryProvider = Provider<PracticeRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return PracticeRepositoryImpl(ApiClient(dio));
});

class PracticeRepositoryImpl implements PracticeRepository {
  final ApiClient _apiClient;

  PracticeRepositoryImpl(this._apiClient);

  @override
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  }) async {
    return await _apiClient.getQuestions(
      page: page,
      limit: limit,
      search: search,
      type: type,
    );
  }

  @override
  Future<Question> getQuestionDetail(String id) async {
    return await _apiClient.getQuestionDetail(id);
  }

  @override
  Future<PracticeSession> createSession({required int limit, String mode = 'random'}) async {
    return await _apiClient.createSession({'mode': mode, 'limit': limit});
  }

  @override
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
  }) async {
    final response = await _apiClient.submitAnswer(sessionId, {
      'questionId': int.parse(
        questionId,
      ), // Transform string ID to backend number
      'userAnswer': userAnswer,
      'duration': duration,
    });
    return response;
  }

  @override
  Future<FirstPrinciplesResponse> analyzeFirstPrinciples({
    required String questionId,
    required String content,
  }) async {
    return await _apiClient.analyzeFirstPrinciples({
      'questionId': questionId,
      'content': content,
    });
  }
}
