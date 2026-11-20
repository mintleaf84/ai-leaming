import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../../practice/domain/question.dart';
import '../domain/question_draft.dart';

/// 建题/改题与草稿校对共用的仓库实例。
final questionEditorRepositoryProvider = Provider<QuestionEditorRepository>((
  ref,
) {
  return QuestionEditorRepository(ref.watch(dioProvider));
});

/// 建题/改题（§35）与 AI 草稿校对（§34）的仓库。
///
/// 为什么是**具体类**而不是 `abstract` 接口 + Impl 两件套：与本仓
/// `WrongBookRepository` 一致——测试用「继承 + override」替身（见
/// `test/features/questions/fake_question_editor_repository.dart`），
/// 不必为每个测试实现全部方法签名；而纯接口文件没有任何可执行行，
/// 覆盖率门禁（`tool/coverage_gate.dart` G2）会把新增的 domain 文件判成 0%。
///
/// 路径一律**不带 `/api` 前缀**：`Dio.baseUrl` 已经以 `/api` 结尾，多写一层
/// 会拼成 `/api/api/...`（404），而界面上只表现为「保存失败」，很难查。
///
/// 不用 retrofit：新增端点每次都要跑 `build_runner`，这里裸 Dio 就能表达
/// （同 `PracticeRepositoryImpl.getSession` 的取舍）。
class QuestionEditorRepository {
  QuestionEditorRepository(this._dio);

  final Dio _dio;

  /// 题目详情（改题页预填用）。`GET /api/questions/:id`。
  Future<Question> fetchQuestion(String id) async {
    final response = await _dio.get<Object?>('/questions/$id');
    return Question.fromJson(_asMap(response.data));
  }

  /// 建题。`POST /api/questions`。
  ///
  /// 返回体可以是题目对象、`{question: ...}`，也可以只有 `{id: ...}`——
  /// 解析不出题目时返回 null，页面不依赖返回值（否则一次成功的保存会被
  /// `Question.fromJson` 的 TypeError 显示成失败）。
  Future<Question?> createQuestion(Map<String, dynamic> payload) async {
    final response = await _dio.post<Object?>('/questions', data: payload);
    return _questionFrom(response.data);
  }

  /// 改题。`PATCH /api/questions/:id`（判分回刷由服务端负责）。
  Future<Question?> updateQuestion(
    String id,
    Map<String, dynamic> payload,
  ) async {
    final response = await _dio.patch<Object?>('/questions/$id', data: payload);
    return _questionFrom(response.data);
  }

  /// 草稿列表。`GET /api/drafts`（可回 `{items: [...]}` 或裸数组）。
  Future<List<QuestionDraftSummary>> listDrafts() async {
    final response = await _dio.get<Object?>('/drafts');
    final data = response.data;
    final list = data is Map
        ? (data['items'] ?? data['drafts'] ?? const <Object?>[])
        : data;
    if (list is! List) return const <QuestionDraftSummary>[];
    return list
        .map((item) => QuestionDraftSummary.fromJson(_asMap(item)))
        .toList();
  }

  /// 草稿详情 + 逐条识别结果。`GET /api/drafts/:id`。
  Future<QuestionDraft> fetchDraft(String id) async {
    final response = await _dio.get<Object?>('/drafts/$id');
    return QuestionDraft.fromJson(_asMap(response.data));
  }

  /// 单条修改 / 确认。`PATCH /api/drafts/:id/items/:idx`。
  Future<QuestionDraftItem?> updateDraftItem(
    String draftId,
    int idx,
    Map<String, dynamic> patch,
  ) async {
    final response = await _dio.patch<Object?>(
      '/drafts/$draftId/items/$idx',
      data: patch,
    );
    final body = _asMap(response.data);
    final map = _asMap(body['item'] ?? body);
    if (map.isEmpty) return null;
    return QuestionDraftItem.fromJson(map);
  }

  /// 单条删除。服务端用同一个 PATCH 端点、载荷 `{deleted: true}`
  /// （§34.2 只登记了 PATCH，没有单独的 DELETE 子路由）。
  Future<void> deleteDraftItem(String draftId, int idx) async {
    await _dio.patch<Object?>(
      '/drafts/$draftId/items/$idx',
      data: <String, dynamic>{'deleted': true},
    );
  }

  /// 把 `confirmed` 的条目事务内写进题库。`POST /api/drafts/:id/confirm`。
  /// 返回 `{created, skipped, conflicts}`；重复调用幂等（第二次 created=0）。
  Future<DraftConfirmResult> confirmDraft(String draftId) async {
    final response = await _dio.post<Object?>('/drafts/$draftId/confirm');
    return DraftConfirmResult.fromJson(_asMap(response.data));
  }

  /// 重新触发 AI 识别（failed 重试）。`POST /api/drafts/:id/analyze`。
  Future<QuestionDraft?> analyzeDraft(String draftId) async {
    final response = await _dio.post<Object?>('/drafts/$draftId/analyze');
    final body = _asMap(response.data);
    if (body.isEmpty) return null;
    final map = _asMap(body['draft'] ?? body);
    if (map.isEmpty) return null;
    return QuestionDraft.fromJson(map);
  }

  /// 丢弃草稿（软删除 status=discarded）。`DELETE /api/drafts/:id`。
  Future<void> discardDraft(String draftId) async {
    await _dio.delete<Object?>('/drafts/$draftId');
  }

  /// 响应体里的题目：可能是题目本体、`{question: ...}`，也可能只有 `{id}`。
  Question? _questionFrom(Object? data) {
    final body = _asMap(data);
    if (body.isEmpty) return null;
    final candidate = _asMap(body['question'] ?? body['item'] ?? body);
    if (!candidate.containsKey('content')) return null;
    return Question.fromJson(candidate);
  }
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.cast<String, dynamic>();
  return const <String, dynamic>{};
}
