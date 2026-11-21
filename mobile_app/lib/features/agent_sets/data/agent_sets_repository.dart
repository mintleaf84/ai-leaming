import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../domain/agent_set_detail.dart';
import '../domain/agent_question_set.dart';

/// AI 题集的 Repository（契约 `docs/agent-question-set-plan.md` §4.2）。
///
/// 路径口径：`Dio.baseUrl` 已含 `/api`（见 `core/constants/api_constants.dart`），
/// 所以这里一律写 `/agent-sets/...`，**不要**再拼 `/api`。
///
/// 响应形状纪律：除了列表以外全是 JSON 对象，统一走 [_requireMap]——拿不到对象
/// 说明服务端形状漂移或代理回了 HTML，直接抛 [FormatException]，让界面走错误态，
/// 而不是把 `null` 当数据继续渲染。
///
/// 幂等（契约 §4.2 与工程规则 1）：
/// - `attempts` 每次调用都**新开一场**练习（同一套题做两次就是两条历史），
///   所以界面层必须挡住重复点击（见练习控制器的 `_opening` 闸）；
/// - `flag` 是幂等的（同一题重复报错只是同一条记录），但仍不允许并发点两次；
/// - `promote` / `paper` 由服务端按批次/题集去重，客户端不做额外缓存。
class AgentSetsRepository {
  final Dio _dio;

  AgentSetsRepository(this._dio);

  /// 我的题集（含未做数、来源、目标考点）。
  Future<AgentSetPage> list({int limit = 20, int offset = 0}) async {
    final response = await _dio.get(
      '/agent-sets',
      queryParameters: <String, dynamic>{'limit': limit, 'offset': offset},
    );
    final data = response.data;
    // 裸数组也认：分页参数由服务端忽略时，直接把列表回过来是最省事的口径。
    if (data is List) return AgentSetPage.fromList(data);
    return AgentSetPage.fromJson(_requireMap(data, 'GET /agent-sets'));
  }

  /// 题集详情（**不含答案**）。
  Future<AgentSetDetail> getSet(int setId) async {
    final response = await _dio.get('/agent-sets/$setId');
    return AgentSetDetail.fromJson(
      _requireMap(response.data, 'GET /agent-sets/{id}'),
    );
  }

  /// 开始练习：服务端建一场 `practice_mode='agent_set'` 的会话并回题目。
  Future<AgentSetAttempt> startAttempt(int setId) async {
    final response = await _dio.post('/agent-sets/$setId/attempts');
    return AgentSetAttempt.fromJson(
      _requireMap(response.data, 'POST /agent-sets/{id}/attempts'),
    );
  }

  /// 标记「这题有问题」：该题立即从题集移除，返回剩余题数。
  Future<AgentFlagResult> flagQuestion(
    int setId,
    int questionId, {
    String? reason,
  }) async {
    final trimmed = (reason ?? '').trim();
    final response = await _dio.post(
      '/agent-sets/$setId/questions/$questionId/flag',
      // 没填原因时不发 `reason` 字段：`reason: ""` 与「没填」在服务端是
      // 两种语义，空串会把「只是点错了」写成「有明确理由」。
      data: <String, dynamic>{if (trimmed.isNotEmpty) 'reason': trimmed},
    );
    return AgentFlagResult.fromJson(
      _requireMap(response.data, 'POST /agent-sets/{id}/questions/{qid}/flag'),
    );
  }

  /// 转正入库（`origin='import'`，此后就是正常题库题）。
  Future<AgentPromoteResult> promote(int setId) async {
    final response = await _dio.post('/agent-sets/$setId/promote');
    return AgentPromoteResult.fromJson(
      _requireMap(response.data, 'POST /agent-sets/{id}/promote'),
    );
  }

  /// 一键成卷：建一张 `source='agent'` 的试卷，题目取该题集可用题。
  Future<AgentSetPaper> createPaper(int setId) async {
    final response = await _dio.post('/agent-sets/$setId/paper');
    return AgentSetPaper.fromJson(
      _requireMap(response.data, 'POST /agent-sets/{id}/paper'),
    );
  }

  Map<String, dynamic> _requireMap(Object? data, String path) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) {
      return data.map((key, value) => MapEntry(key.toString(), value));
    }
    throw FormatException(
      '$path 返回的不是 JSON 对象（${data.runtimeType}），'
      '请检查服务器地址是否指向 /api 后端',
    );
  }
}

/// Repository Provider。
///
/// 用 `watch`：`dioProvider` 在服务器地址变更后重建，题集请求必须跟着换地址
/// （与 `examRepositoryProvider`、`recallRepositoryProvider` 同一理由）。
final agentSetsRepositoryProvider = Provider<AgentSetsRepository>((ref) {
  return AgentSetsRepository(ref.watch(dioProvider));
});
