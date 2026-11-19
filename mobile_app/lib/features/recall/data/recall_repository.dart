import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../domain/recall_card.dart';
import '../domain/recall_deck.dart';
import '../domain/recall_queue.dart';
import '../domain/recall_review.dart';

/// 回忆自测 Repository。
///
/// 路径口径：`Dio.baseUrl` 已经包含 `/api`（见 `core/constants/api_constants.dart`
/// 的地址规范化），所以这里一律写 `/recall/...`，**不要**再拼 `/api`。
///
/// 所有响应都是 JSON 对象（列表也在 `{data, meta}` 里），因此统一走 [_requireMap]：
/// 拿不到对象说明服务端形状漂移或代理回了 HTML，直接抛 [FormatException]，
/// 让上层（provider / 界面）走错误态，而不是把 `null` 当数据继续渲染。
class RecallRepository {
  final Dio _dio;

  RecallRepository(this._dio);

  /// 今日队列（到期优先 + 新卡额度）。
  ///
  /// 队列是纯查询，重复调用结果一致；但**不要**用它来「刷新进度」——提交后
  /// 应以 `submitReview` 的返回值（`nextDue` / `nextReviewText`）为准。
  Future<RecallQueue> getQueue() async {
    final response = await _dio.get('/recall/queue');
    return RecallQueue.fromJson(_requireMap(response.data, '/recall/queue'));
  }

  /// 卡组列表（含当前身份的进度统计）。
  Future<RecallDeckListPage> listDecks({int limit = 20, int offset = 0}) async {
    final response = await _dio.get(
      '/recall/decks',
      queryParameters: {'limit': limit, 'offset': offset},
    );
    return RecallDeckListPage.fromJson(
      _requireMap(response.data, '/recall/decks'),
    );
  }

  /// 卡组详情 + 卡片列表（`state` 只反映当前身份）。
  Future<RecallDeckPage> getDeck(
    String deckKey, {
    int limit = 20,
    int offset = 0,
  }) async {
    final response = await _dio.get(
      '/recall/decks/${Uri.encodeComponent(deckKey)}',
      queryParameters: {'limit': limit, 'offset': offset},
    );
    return RecallDeckPage.fromJson(
      _requireMap(response.data, '/recall/decks/{deckKey}'),
    );
  }

  /// 单张卡片详情（含 `mode` / `pendingItems` / `deckTitle`）。
  Future<RecallCard> getCard(int cardId) async {
    final response = await _dio.get('/recall/cards/$cardId');
    return RecallCard.fromJson(
      _requireMap(response.data, '/recall/cards/{cardId}'),
    );
  }

  /// 提交一次作答（判分 + 调度 + 落日志）。
  ///
  /// 幂等纪律在这一层是**结构上**成立的：[draft] 的 `toPayload()` 首次调用即冻结，
  /// 所以「重试」只要还是同一个 draft 实例，发出去的就是同一份载荷 + 同一个
  /// `clientKey`。调用方不要在这里包「失败就重建 draft 再发」的兜底——
  /// 那会让服务端当成新作答，进度被推进两次（服务端会回 `duplicate: false`，
  /// 界面上看不出异常，属于静默数据损坏）。
  Future<RecallReviewResult> submitReview(RecallReviewDraft draft) {
    return submitReviewPayload(draft.toPayload());
  }

  /// 直接用一份已构造好的载荷提交（重放场景）。
  ///
  /// 只给「载荷已经冻结、要原样重发」的调用方用；新作答请用 [submitReview]。
  Future<RecallReviewResult> submitReviewPayload(
    Map<String, dynamic> payload,
  ) async {
    final response = await _dio.post('/recall/reviews', data: payload);
    return RecallReviewResult.fromJson(
      _requireMap(response.data, '/recall/reviews'),
    );
  }

  /// 把卡片移出当前身份的复习队列（归档）。天然幂等。
  Future<RecallArchiveResult> archive(int cardId) async {
    final response = await _dio.post('/recall/cards/$cardId/archive');
    return RecallArchiveResult.fromJson(
      _requireMap(response.data, '/recall/cards/{cardId}/archive'),
    );
  }

  /// 取消归档（放回队列）。没归档过时返回 `restored: false`，不算错误。
  Future<RecallRestoreResult> unarchive(int cardId) async {
    final response = await _dio.delete('/recall/cards/$cardId/archive');
    return RecallRestoreResult.fromJson(
      _requireMap(response.data, '/recall/cards/{cardId}/archive'),
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
/// 用 `watch` 而不是 `read`：`dioProvider` 会在服务器地址变更后重建，
/// 仓库必须跟着换成新 dio，否则换服务器后回忆队列仍然打旧地址
/// （与 `wrongBookRepositoryProvider` 同一理由）。
final recallRepositoryProvider = Provider<RecallRepository>((ref) {
  return RecallRepository(ref.watch(dioProvider));
});
