import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/token_util.dart';
import '../../../core/error/user_message.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/sync/sync_providers.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/fill_blank_answer.dart';
import '../domain/practice_exceptions.dart';
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
///
/// 实现 [UserFacingException]：这类异常的文案是业务层精心写的（「本地题库为空
/// 或已超过 7 天未刷新…」），不该被 [userMessageOf] 归到「出了点问题」。
class OfflineCacheUnavailable implements UserFacingException {
  const OfflineCacheUnavailable(this.message);

  final String message;

  @override
  String get userMessage => message;

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
  Future<PracticeSession> createSession({
    required int limit,
    String mode = 'random',
  }) async {
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
        throw const OfflineCacheUnavailable('本地题库为空或已超过 7 天未刷新，请联网同步题库后再离线练习');
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
      return PracticeSession(
        sessionId: localId,
        questions: questions,
        practiceMode: mode,
      );
    } on OfflineCacheUnavailable {
      rethrow;
    } catch (error) {
      // 本地库故障（磁盘/权限）不该伪装成"没网"，转成可读原因
      throw OfflineCacheUnavailable('本地题库读取失败：$error');
    }
  }

  /// 按 sessionId 取回待作答题目（错题本「开始练习」/ 首页「继续上次练习」用）。
  /// 后端 `GET /api/practice/session/:sessionId` 返回
  /// `{sessionId, questions[], completedCount, practiceMode}`，
  /// 多出的字段由 json_serializable 忽略。
  @override
  Future<PracticeSession> getSession(String sessionId) async {
    // 离线会话（`local_` 前缀）在服务端不存在：重启后续练必须从本地会话 +
    // 题目缓存重建，否则会打到一个必然 404 的地址上（review A4）。
    if (sessionId.startsWith('local_')) {
      return _loadLocalSession(sessionId);
    }
    final response = await _dio.get('/practice/session/$sessionId');
    return PracticeSession.fromJson(response.data as Map<String, dynamic>);
  }

  /// 从本地会话记录 + 题目缓存重建一场离线练习。
  ///
  /// 三道闸门都不能省：
  /// 1. 会话必须属于当前账号（本地库按设备共享，登出不清会话）；
  /// 2. 题面缺失或已过期（> [LocalPracticeStore.cacheMaxAgeDays] 天未联网）拒绝；
  /// 3. 题面必须带可信答案（[LocalPracticeStore.questionById] 已过滤空答案）。
  ///
  /// 任何一题不满足都整体拒绝，**不跳过那一题**：跳过会让题序错位，
  /// 断点里的「第几题」与恢复出来的题对不上，进度就永久错了。
  Future<PracticeSession> _loadLocalSession(String localId) async {
    final owner = await _localStore.localSessionOwner(localId);
    if (owner == null) {
      throw const OfflineCacheUnavailable('本地找不到这场练习的记录，请重新开始一场');
    }
    final currentUserId = await _currentUserId();
    if (currentUserId == null || owner != currentUserId) {
      throw const OfflineCacheUnavailable('这场离线练习不属于当前账号，请重新开始一场');
    }

    final questionIds = await _localStore.localSessionQuestionIds(localId);
    if (questionIds == null || questionIds.isEmpty) {
      throw const OfflineCacheUnavailable('本地找不到这场练习的记录，请重新开始一场');
    }
    final questions = <Question>[];
    for (final questionId in questionIds) {
      final question = await _localStore.questionById(questionId);
      if (question == null) {
        throw const OfflineCacheUnavailable(
          '本地题面已过期或缺少答案，请联网刷新题库后再继续这场练习',
        );
      }
      final answer = question.answer;
      if (answer == null || answer.trim().isEmpty) {
        // 兜底：即使存储层将来放宽了过滤，没有答案的题也不能拿来续练判分。
        throw const OfflineCacheUnavailable(
          '本地题面已过期或缺少答案，请联网刷新题库后再继续这场练习',
        );
      }
      questions.add(question);
    }
    return PracticeSession(
      sessionId: localId,
      questions: questions,
      // 模式从本地会话记录还原：缺了它，离线续练会把自己记成随机。
      practiceMode: await _localStore.localSessionMode(localId),
    );
  }

  @override
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
    String? mode,
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

    // 服务端契约里题号是数字，但**不能假设**：脏缓存/手工构造的请求会让
    // `int.parse` 抛 `FormatException`，界面拿到的就是 `Invalid radix-10 ...`。
    // 非数字按业务错误处理，文案见 [InvalidQuestionIdException]。
    final questionIdNumber = int.tryParse(questionId.trim());
    if (questionIdNumber == null) {
      debugPrint('[Practice] 题号不是数字，拒绝提交: $questionId');
      throw InvalidQuestionIdException(questionId);
    }

    try {
      return await _apiClient.submitAnswer(sessionId, {
        'questionId': questionIdNumber, // Transform string ID to backend number
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
        sessionQuestionIds: sessionQuestionIds,
        mode: mode,
      );
    }
  }

  /// 会话进行到一半断网：把这一题按离线口径判分入队，练习不至于中断。
  ///
  /// 幂等键取 `local_<serverSessionId>`：这半场练习只会补交一次，
  /// 服务端会新开一场（`agent_` 前缀）只含断网后的题，不会与已在线提交的题重复计数。
  ///
  /// [sessionQuestionIds] 是整场题序（控制器传进来）：降级后的本地会话必须记全，
  /// 否则重启后续练只剩断网那一题，题序与断点全对不上（review 二轮 4）。
  Future<Map<String, dynamic>> _degradeToOffline({
    required String serverSessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
    String? mode,
  }) async {
    final localId = 'local_$serverSessionId';
    final userId = await _currentUserId();
    if (userId == null) {
      throw const OfflineCacheUnavailable('登录已失效，无法离线记录本次作答');
    }
    final questionIds = <String>[
      ...(sessionQuestionIds ?? <String>[questionId]),
    ];
    if (!questionIds.contains(questionId)) {
      questionIds.add(questionId);
    }
    try {
      await _localStore.ensureLocalSession(
        localId: localId,
        userId: userId,
        // 真实模式优先；不知道时才落内部标记（`localSessionMode` 不会把它当
        // 练习模式返回，续练会走「未知 → 其它练习」这条路）。
        mode: mode ?? 'offline-resume',
        questionIds: questionIds,
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
    if (question == null) {
      // 没有缓存（或缓存已过期）就没有可信答案，宁可不判分也不写错数据
      throw const OfflineCacheUnavailable('本地没有这道题的最新题面，无法离线判分，请联网后重试');
    }
    final correctAnswer = question.answer ?? '';
    final isCorrect = _judgeLocally(
      userAnswer: userAnswer,
      correctAnswer: correctAnswer,
      questionType: question.type,
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
      return <String, dynamic>{
        'isCorrect': isCorrect,
        'correctAnswer': correctAnswer,
        'offline': true,
        'persisted': true,
      };
    } catch (error) {
      // 入队失败 = 这次作答永久丢失，不能假装成功：把结果连同失败标记返回，
      // 由上层提示用户重练；判分本身仍然给用户看。
      debugPrint('[Practice] 离线作答入队失败: $error');
      return <String, dynamic>{
        'isCorrect': isCorrect,
        'correctAnswer': correctAnswer,
        'offline': true,
        'persisted': false,
      };
    }
  }

  /// 本地判分。
  ///
  /// 多选题的提交值是 `jsonEncode(["A","B"])`，必须先解出选项再比；
  /// 选项类题型（单选/多选/判断）按字母集合比较（忽略顺序），
  /// 填空按服务端同一套逐空规则（`fillBlanksMatch`），
  /// 简答题退化为去噪声后的字符串相等——否则 `CAT` 与 `ACT` 会被误判为相同。
  bool _judgeLocally({
    required String userAnswer,
    required String correctAnswer,
    required String questionType,
  }) {
    // 填空先走自己的分支：它的「空数一致 + 每空可接受多答案」规则在
    // `answer-check.ts` 里是明确的，本地不能比服务端更宽松（同一道题
    // 离线判对、补交后服务端判错，比判错更难解释）。
    if (questionType == 'fill_blank') {
      return fillBlanksMatch(userAnswer, correctAnswer);
    }

    final user = _normalizeAnswer(userAnswer);
    final correct = _normalizeAnswer(correctAnswer);
    if (user.isEmpty || correct.isEmpty) {
      return false;
    }

    final isChoiceType =
        questionType == 'single' ||
        questionType == 'multi' ||
        questionType == 'truefalse';
    final optionPattern = RegExp(r'^[A-Z]+$');
    if (isChoiceType &&
        optionPattern.hasMatch(user) &&
        optionPattern.hasMatch(correct)) {
      return setEquals(user.split('').toSet(), correct.split('').toSet());
    }
    return user == correct;
  }

  /// 把作答规范成可比较的形式：JSON 数组 → 字母串；去空白/分隔符；统一大写。
  String _normalizeAnswer(String value) {
    final trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is List) {
          return decoded.map((item) => item.toString()).join().toUpperCase();
        }
      } catch (_) {
        // 不是合法 JSON：按原串处理，交给下面的规范化逻辑
      }
    }
    return trimmed.replaceAll(RegExp(r'[\s,，、;；]'), '').toUpperCase();
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
