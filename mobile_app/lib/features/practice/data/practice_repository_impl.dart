import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/sync/sync_providers.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/practice_repository.dart';
import '../domain/question.dart';
import '../domain/practice_session.dart';
import '../domain/first_principles_response.dart';
import 'local_practice_store.dart';

final practiceRepositoryProvider = Provider<PracticeRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return PracticeRepositoryImpl(
    ApiClient(dio),
    dio,
    ref.watch(localPracticeStoreProvider),
  );
});

class PracticeRepositoryImpl implements PracticeRepository {
  final ApiClient _apiClient;
  // 手写 Dio：`GET /practice/session/{id}` 是 2026-11 新增端点，
  // 加进 retrofit 注解就必须重新跑 build_runner 生成 api_client.g.dart，
  // 而本机没有 Flutter 工具链。用裸 Dio + 已有的 PracticeSession.fromJson 达到同样效果，
  // 等下次 CI/本机跑过 build_runner 后再迁回 retrofit。
  final Dio _dio;

  /// 离线存储：远端失败时兜底出题、本地判分、作答入队。
  final LocalPracticeStore _localStore;

  PracticeRepositoryImpl(this._apiClient, this._dio, this._localStore);

  @override
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  }) async {
    final response = await _apiClient.getQuestions(
      page: page,
      limit: limit,
      search: search,
      type: type,
    );
    // 每次成功拉到题库就顺手写进本地缓存，离线时才有题可出。
    // 缓存失败不能影响正常刷题，所以只记日志。
    try {
      await _localStore.cacheQuestions(response.items);
    } catch (error) {
      debugPrint('[Practice] 题目缓存失败: $error');
    }
    return response;
  }

  @override
  Future<Question> getQuestionDetail(String id) async {
    return await _apiClient.getQuestionDetail(id);
  }

  @override
  Future<PracticeSession> createSession({required int limit, String mode = 'random'}) async {
    try {
      return await _apiClient.createSession({'mode': mode, 'limit': limit});
    } on DioException catch (error) {
      // 只有「连不上服务器」时才降级离线；4xx/5xx 是服务端明确拒绝，
      // 静默换成本地出题会掩盖真实问题。
      final isOffline = error.response == null;
      if (!isOffline) {
        rethrow;
      }
      final local = await _createOfflineSession(limit: limit, mode: mode);
      if (local == null) {
        rethrow;
      }
      return local;
    }
  }

  /// 用本地缓存出题；缓存为空时返回 null（调用方继续抛原始网络异常）。
  Future<PracticeSession?> _createOfflineSession({
    required int limit,
    required String mode,
  }) async {
    try {
      final questions = await _localStore.pickRandom(limit: limit);
      if (questions.isEmpty) {
        return null;
      }
      final localId = await _localStore.createLocalSession(
        mode: mode,
        questionIds: questions.map((question) => question.id).toList(),
      );
      return PracticeSession(sessionId: localId, questions: questions);
    } catch (error) {
      debugPrint('[Practice] 离线出题失败: $error');
      return null;
    }
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
    // 本地会话（local_ 前缀）没有服务端记录：本地判分 + 落待同步队列。
    if (sessionId.startsWith('local_')) {
      return _submitOfflineAnswer(
        sessionId: sessionId,
        questionId: questionId,
        userAnswer: userAnswer,
        duration: duration,
      );
    }

    final response = await _apiClient.submitAnswer(sessionId, {
      'questionId': int.parse(
        questionId,
      ), // Transform string ID to backend number
      'userAnswer': userAnswer,
      'duration': duration,
    });
    return response;
  }

  /// 离线判分：用缓存的答案比对，并把作答写入待同步队列。
  ///
  /// 判分口径与后端 `checkAnswerCorrectness` 保持「多选题忽略顺序」的一致取向；
  /// 填空题/判断题退化为去噪声后的字符串相等。
  Future<Map<String, dynamic>> _submitOfflineAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
  }) async {
    final question = await _localStore.questionById(questionId);
    final correctAnswer = question?.answer ?? '';
    final isCorrect = _judgeLocally(
      userAnswer: userAnswer,
      correctAnswer: correctAnswer,
    );

    try {
      await _localStore.recordAnswer(
        localId: sessionId,
        questionId: questionId,
        userAnswer: userAnswer,
        isCorrect: isCorrect,
        durationMs: duration > 0 ? duration * 1000 : null,
      );
    } catch (error) {
      // 入队失败不影响本次作答体验，但要留下痕迹：这条答案会丢。
      debugPrint('[Practice] 离线作答入队失败（该答案不会同步）: $error');
    }

    return <String, dynamic>{
      'isCorrect': isCorrect,
      'correctAnswer': correctAnswer,
    };
  }

  /// 本地判分：都是「选项字母集合」时按集合比（多选不看顺序），否则按字符串比。
  bool _judgeLocally({required String userAnswer, required String correctAnswer}) {
    String normalize(String value) =>
        value.replaceAll(RegExp(r'[\s,，、;；]'), '').toUpperCase();

    final user = normalize(userAnswer);
    final correct = normalize(correctAnswer);
    if (user.isEmpty || correct.isEmpty) {
      return false;
    }

    final optionPattern = RegExp(r'^[A-Z]+$');
    if (optionPattern.hasMatch(user) && optionPattern.hasMatch(correct)) {
      final userSet = user.split('').toSet();
      final correctSet = correct.split('').toSet();
      return setEquals(userSet, correctSet);
    }
    return user == correct;
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
