import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/error/user_message.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';

/// 知识卡片模型
class KnowledgeCard {
  final int id;
  final String title;
  final String category;
  final List<String> tags;
  final String front;
  final String back;
  final List<KeyPoint> keyPoints;
  final String? createdAt;

  KnowledgeCard({
    required this.id,
    required this.title,
    required this.category,
    required this.tags,
    required this.front,
    required this.back,
    required this.keyPoints,
    this.createdAt,
  });

  factory KnowledgeCard.fromJson(Map<String, dynamic> json) {
    return KnowledgeCard(
      id: json['id'] as int,
      title: json['title'] as String,
      category: json['category'] as String? ?? '未分类',
      tags: (json['tags'] as List?)?.map((e) => e as String).toList() ?? [],
      front: json['front'] as String,
      back: json['back'] as String,
      keyPoints:
          (json['key_points'] as List?)
              ?.map((e) => KeyPoint.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: json['created_at'] as String?,
    );
  }
}

class KeyPoint {
  final String term;
  final String definition;

  KeyPoint({required this.term, required this.definition});

  factory KeyPoint.fromJson(Map<String, dynamic> json) {
    return KeyPoint(
      term: json['term'] as String,
      definition: json['definition'] as String,
    );
  }
}

/// 知识卡片列表状态
class KnowledgeListState {
  final List<KnowledgeCard> cards;
  final List<String> categories;
  final bool isLoading;
  final String? error;

  const KnowledgeListState({
    this.cards = const [],
    this.categories = const [],
    this.isLoading = false,
    this.error,
  });

  KnowledgeListState copyWith({
    List<KnowledgeCard>? cards,
    List<String>? categories,
    bool? isLoading,
    String? error,
  }) {
    return KnowledgeListState(
      cards: cards ?? this.cards,
      categories: categories ?? this.categories,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 知识卡片控制器
class KnowledgeController extends Notifier<KnowledgeListState> {
  /// 请求序号：每发起一次加载自增，回调落地前比对，避免「先发后到」的旧响应
  /// 覆盖新响应（快速切分类时会出现）。
  int _requestSeq = 0;

  @override
  KnowledgeListState build() => const KnowledgeListState();

  ApiClient get _apiClient {
    // 用 read 而不是 watch：这里在控制器方法里取一次用，不参与 build 的依赖图。
    // watch 会把「后端地址变了」变成对本控制器的 invalidateSelf，正在加载的
    // 列表被重建回空态，方法里随后落地的 state 也就写不回去了。
    final dio = ref.read(dioProvider);
    return ApiClient(dio);
  }

  /// 加载卡片列表
  Future<void> loadCards({String? category}) async {
    final seq = ++_requestSeq;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.getKnowledgeCards(
        category: category,
        limit: 100,
      );

      final cards = (response['cards'] as List<dynamic>)
          .map((e) => KnowledgeCard.fromJson(e as Map<String, dynamic>))
          .toList();

      final categories = (response['categories'] as List<dynamic>)
          .map((e) => e as String)
          .toList();

      // 已经有更新的请求发出，这份旧结果（含其失败）必须整体丢弃。
      if (seq != _requestSeq) return;

      state = state.copyWith(
        isLoading: false,
        cards: cards,
        categories: categories,
      );
    } catch (e) {
      if (seq != _requestSeq) return;
      // 原始异常只进日志，界面用统一文案（审计 #24）。
      debugPrint('[Knowledge] 加载知识库失败: $e');
      state = state.copyWith(isLoading: false, error: userMessageOf(e));
    }
  }

  /// 创建新卡片
  Future<void> createCard(Map<String, dynamic> cardData) async {
    /* 
      cardData example:
      {
        "title": "...",
        "front": "...",
        "back": "...",
        "category": "...",
        "tags": ["..."]
      }
    */
    try {
      await _apiClient.createKnowledgeCard(cardData);
      // 创建成功后刷新列表
      await loadCards();
    } catch (e) {
      // 这里的错误处理可以更精细，比如抛出让 UI 捕获
      rethrow;
    }
  }
}

final knowledgeControllerProvider =
    NotifierProvider<KnowledgeController, KnowledgeListState>(
      KnowledgeController.new,
    );
