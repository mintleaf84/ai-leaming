import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/practice_repository.dart';
import '../domain/question.dart';
import '../domain/practice_session.dart';

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
  Future<PracticeSession> createSession({required int limit}) async {
    return await _apiClient.createSession({'mode': 'random', 'limit': limit});
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
}
