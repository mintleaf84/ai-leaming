import 'recall_card.dart';
import 'recall_json.dart';

/// 卡组列表项（`GET /recall/decks` 的 `data[]`）。
///
/// 三个计数只统计**当前身份**的数据；`cardCount` 是卡组内容总量（全局共享）。
class RecallDeck {
  /// 卡组标识（导入导出文件里的 deckId）。
  final String deckKey;

  /// 卡组标题。
  final String title;

  /// 卡组内卡片总数。
  final int cardCount;

  /// 未归档且已有复习状态的卡片数（含未到期）。
  final int activeCount;

  /// 已归档（移出队列）的卡片数。
  final int archivedCount;

  /// 当前到期可复习的卡片数。
  final int dueCount;

  const RecallDeck({
    required this.deckKey,
    required this.title,
    required this.cardCount,
    required this.activeCount,
    required this.archivedCount,
    required this.dueCount,
  });

  factory RecallDeck.fromJson(Map<String, dynamic> json) {
    return RecallDeck(
      deckKey: readString(json['deckKey']),
      title: readString(json['title']),
      cardCount: readInt(json['cardCount']),
      activeCount: readInt(json['activeCount']),
      archivedCount: readInt(json['archivedCount']),
      dueCount: readInt(json['dueCount']),
    );
  }

  Map<String, dynamic> toJson() => {
    'deckKey': deckKey,
    'title': title,
    'cardCount': cardCount,
    'activeCount': activeCount,
    'archivedCount': archivedCount,
    'dueCount': dueCount,
  };
}

/// 卡组内的分组（`deck.groups[]`）。`order` 可能缺省。
class RecallDeckGroup {
  final String groupId;
  final String title;
  final int? order;

  const RecallDeckGroup({
    required this.groupId,
    required this.title,
    this.order,
  });

  factory RecallDeckGroup.fromJson(Map<String, dynamic> json) {
    return RecallDeckGroup(
      groupId: readString(json['groupId']),
      title: readString(json['title']),
      order: json['order'] == null ? null : readInt(json['order']),
    );
  }

  Map<String, dynamic> toJson() => {
    'groupId': groupId,
    'title': title,
    if (order != null) 'order': order,
  };
}

/// 卡组详情里的 `deck` 对象（`GET /recall/decks/{deckKey}`）。
class RecallDeckDetail {
  final String deckKey;
  final String title;
  final List<RecallDeckGroup> groups;

  const RecallDeckDetail({
    required this.deckKey,
    required this.title,
    this.groups = const [],
  });

  factory RecallDeckDetail.fromJson(Map<String, dynamic> json) {
    return RecallDeckDetail(
      deckKey: readString(json['deckKey']),
      title: readString(json['title']),
      groups: readObjectList(json['groups'], RecallDeckGroup.fromJson),
    );
  }

  Map<String, dynamic> toJson() => {
    'deckKey': deckKey,
    'title': title,
    'groups': groups.map((group) => group.toJson()).toList(),
  };
}

/// 统一的 `{limit, offset, total}` 分页元数据。
class RecallPageMeta {
  /// 本次请求的实际条数上限（服务端已截到 100 以内）。
  final int limit;

  /// 本次请求的偏移量。
  final int offset;

  /// 符合条件的总条数。
  final int total;

  const RecallPageMeta({
    required this.limit,
    required this.offset,
    required this.total,
  });

  factory RecallPageMeta.fromJson(Map<String, dynamic>? json) {
    return RecallPageMeta(
      limit: readInt(json?['limit']),
      offset: readInt(json?['offset']),
      total: readInt(json?['total']),
    );
  }

  Map<String, dynamic> toJson() => {
    'limit': limit,
    'offset': offset,
    'total': total,
  };

  /// 是否还有下一页（按 offset+limit < total 判断）。
  bool get hasMore => offset + limit < total;
}

/// `GET /recall/decks` 的整页响应。
class RecallDeckListPage {
  final List<RecallDeck> decks;
  final RecallPageMeta meta;

  const RecallDeckListPage({required this.decks, required this.meta});

  factory RecallDeckListPage.fromJson(Map<String, dynamic> json) {
    return RecallDeckListPage(
      decks: readObjectList(json['data'], RecallDeck.fromJson),
      meta: RecallPageMeta.fromJson(readMap(json['meta'])),
    );
  }

  Map<String, dynamic> toJson() => {
    'data': decks.map((deck) => deck.toJson()).toList(),
    'meta': meta.toJson(),
  };
}

/// `GET /recall/decks/{deckKey}` 的整页响应：卡组详情 + 卡片列表。
class RecallDeckPage {
  final RecallDeckDetail deck;
  final List<RecallCard> cards;
  final RecallPageMeta meta;

  const RecallDeckPage({
    required this.deck,
    required this.cards,
    required this.meta,
  });

  factory RecallDeckPage.fromJson(Map<String, dynamic> json) {
    final deckJson = readMap(json['deck']);
    return RecallDeckPage(
      deck: deckJson == null
          ? const RecallDeckDetail(deckKey: '', title: '')
          : RecallDeckDetail.fromJson(deckJson),
      cards: readObjectList(json['data'], RecallCard.fromJson),
      meta: RecallPageMeta.fromJson(readMap(json['meta'])),
    );
  }

  Map<String, dynamic> toJson() => {
    'deck': deck.toJson(),
    'data': cards.map((card) => card.toJson()).toList(),
    'meta': meta.toJson(),
  };
}
