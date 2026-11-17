import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/practice_repository.dart';
import '../domain/question.dart';
import '../domain/practice_session.dart';
import '../domain/first_principles_response.dart';

final practiceRepositoryProvider = Provider<PracticeRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return PracticeRepositoryImpl(ApiClient(dio), dio);
});

class PracticeRepositoryImpl implements PracticeRepository {
  final ApiClient _apiClient;
  // 手写 Dio：`GET /practice/session/{id}` 是 2026-11 新增端点，
  // 加进 retrofit 注解就必须重新跑 build_runner 生成 api_client.g.dart，
  // 而本机没有 Flutter 工具链。用裸 Dio + 已有的 PracticeSession.fromJson 达到同样效果，
  // 等下次 CI/本机跑过 build_runner 后再迁回 retrofit。
  final Dio _dio;

  PracticeRepositoryImpl(this._apiClient, this._dio);

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

  /// 按 sessionId 取回待作答题目（错题本「开始练习」用）。
  /// 后端 `GET /api/practice/session/:sessionId` 返回
  /// `{sessionId, questions[], completedCount, practiceMode}`，
  /// 多出的字段由 json_serializable 忽略。
  @override
  Future<PracticeSession> getSession(String sessionId) async {
    final response = await _dio.get('/practice/session/$sessionId');
    return PracticeSession.fromJson(response.data as Map<String, dynamic>);
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
    required String questionContent,
    required String correctAnswer,
    String? explanation,
    String? wrongAnswer,
  }) async {
    return await _apiClient.analyzeFirstPrinciples({
      'questionContent': questionContent,
      'correctAnswer': correctAnswer,
      if (explanation != null) 'explanation': explanation,
      if (wrongAnswer != null) 'wrongAnswer': wrongAnswer,
    });
  }
}
