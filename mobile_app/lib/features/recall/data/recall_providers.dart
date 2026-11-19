import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/recall_card.dart';
import '../domain/recall_deck.dart';
import '../domain/recall_queue.dart';
import 'recall_repository.dart';

/// 回忆自测的只读数据 Provider 组。
///
/// 只放**读**：队列、卡组、卡片都是服务端权威快照，用 `FutureProvider` 直接映射，
/// 不做本地缓存（复习进度由提交结果推进，缓存一层会让「下次 11 月 20 日」和队列
/// 互相打架）。写操作（提交/归档）由界面层调用 `RecallRepository`，
/// 成功后 `ref.invalidate` 对应的 provider。
///
/// 全部 `autoDispose`：离开回忆页就该丢快照，否则用户第二天进来看到的是昨天
/// 的队列（学习日 04:00 切换，本地没法自己算）。

/// 今日队列。
final recallQueueProvider = FutureProvider.autoDispose<RecallQueue>((ref) {
  return ref.watch(recallRepositoryProvider).getQueue();
});

/// 卡组列表（一页取 50：卡组数量级是「几十个」，不做无限滚动）。
final recallDecksProvider = FutureProvider.autoDispose<RecallDeckListPage>((
  ref,
) {
  return ref.watch(recallRepositoryProvider).listDecks(limit: 50);
});

/// 卡组详情的查询参数（`family` 的键）。
///
/// 用 record 而不是裸 `String`：同一个卡组会翻页，键里必须带 `limit`/`offset`，
/// 否则第二页的结果会覆盖第一页的缓存。
typedef RecallDeckQuery = ({String deckKey, int limit, int offset});

/// 卡组详情 + 卡片列表。
final recallDeckProvider = FutureProvider.autoDispose
    .family<RecallDeckPage, RecallDeckQuery>((ref, query) {
      return ref
          .watch(recallRepositoryProvider)
          .getDeck(query.deckKey, limit: query.limit, offset: query.offset);
    });

/// 单张卡片详情（含 `mode` / `pendingItems`）。
///
/// 每次进入作答屏都要重新取：`mode` 与 `pendingItems` 会在上一张卡提交后变化，
/// 用缓存会拿着一张「首发」的卡去做重测。
final recallCardProvider = FutureProvider.autoDispose.family<RecallCard, int>((
  ref,
  cardId,
) {
  return ref.watch(recallRepositoryProvider).getCard(cardId);
});
