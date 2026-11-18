import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/token_util.dart';
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

/// 离线缓存不可用（为空或已过期）时抛出，带可直接展示的中文原因。
class OfflineCacheUnavailable implements Exception {
  const OfflineCacheUnavailable(this.message);

  final String message;

  @override
  String toString() => message;
}

class PracticeRepositoryImpl implements PracticeRepository {
  final ApiClient _apiClient;
  // 手写 Dio：`GET /practice/session/{id}` 是 2026-11 新增端点，
  // 加进 retrofit 注解就必须重新跑 build_runner 生成 api_client.g.dart，
  // 而本机没有 Flutter 工具链。用裸 Dio + 已有的 PracticeSession.fromJson 达到同样效果，
  // 等下次 CI/本机跑过 build_runner 后再迁回 retrofit。
  final Dio _dio;

  /// 离线存储：远端失败时兜底出题、本地判分、作答入队。
  final LocalPracticeStore _localStore;

  /// 待同步数据必须带账号归属，避免 A 的作答被 B 的凭据上传。
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> _currentUserId() async {
    final token = await _storage.read(key: 'jwt_token');
    if (token == null || token.isEmpty) {
      return null;
    }
    return TokenUtil.userIdOf(token);
  }

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
      return await _createOfflineSession(limit: limit, mode: mode);
    }
  }

  /// 用本地缓存出题；缓存为空或过期时抛 [OfflineCacheUnavailable]。
  Future<PracticeSession> _createOfflineSession({
    required int limit,
    required String mode,
  }) async {
    try {
      final questions = await _localStore.pickRandom(limit: limit);
      if (questions.isEmpty) {
        throw const OfflineCacheUnavailable(
          '本地题库为空或已超过 7 天未刷新，请联网同步题库后再离线练习',
        );
      }
      final userId = await _currentUserId();
      if (userId == null) {
        throw const OfflineCacheUnavailable('登录已失效，无法开始离线练习，请重新登录');
      }
      final localId = await _localStore.createLocalSession(
        userId: userId,
        mode: mode,
        questionIds: questions.map((question) => question.id).toList(),
      );
      return PracticeSession(sessionId: localId, questions: questions);
    } on OfflineCacheUnavailable {
      rethrow;
    } catch (error) {
      // 本地库故障（磁盘/权限）不该伪装成"没网"，转成可读原因
      throw OfflineCacheUnavailable('本地题库读取失败：$error');
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

    try {
      return await _apiClient.submitAnswer(sessionId, {
        'questionId': int.parse(
          questionId,
        ), // Transform string ID to backend number
        'userAnswer': userAnswer,
        'duration': duration,
      });
    } on DioException catch (error) {
      // 只有「连不上服务器」时才降级：4xx/5xx 是服务端明确拒绝，必须原样抛出，
      // 否则会把鉴权/参数错误伪装成"离线"，用户永远看不到真正原因。
      if (error.response != null) {
        rethrow;
      }
      return _degradeToOffline(
        serverSessionId: sessionId,
        questionId: questionId,
        userAnswer: userAnswer,
        duration: duration,
      );
    }
  }

  /// 会话进行到一半断网：把这一题按离线口径判分入队，练习不至于中断。
  ///
  /// 幂等键取 `local_<serverSessionId>`：这半场练习只会补交一次，
  /// 服务端会新开一场（`agent_` 前缀）只含断网后的题，不会与已在线提交的题重复计数。
  Future<Map<String, dynamic>> _degradeToOffline({
    required String serverSessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
  }) async {
    final localId = 'local_$serverSessionId';
    final userId = await _currentUserId();
    if (userId == null) {
      throw const OfflineCacheUnavailable('登录已失效，无法离线记录本次作答');
    }
    try {
      await _localStore.ensureLocalSession(
        localId: localId,
        userId: userId,
        mode: 'offline-resume',
        questionIds: <String>[questionId],
      );
    } catch (error) {
      debugPrint('[Practice] 断网降级建会话失败: $error');
    }

    final result = await _submitOfflineAnswer(
      sessionId: localId,
      questionId: questionId,
      userAnswer: userAnswer,
      duration: duration,
    );
    return <String, dynamic>{...result, 'offline': true};
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

    final userId = await _currentUserId();
    if (userId == null) {
      throw const OfflineCacheUnavailable('登录已失效，无法离线记录本次作答');
    }

    try {
      await _localStore.recordAnswer(
        localId: sessionId,
        userId: userId,
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
