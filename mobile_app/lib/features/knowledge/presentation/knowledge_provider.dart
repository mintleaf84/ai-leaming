import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  @override
  KnowledgeListState build() => const KnowledgeListState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载卡片列表
  Future<void> loadCards({String? category}) async {
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

      state = state.copyWith(
        isLoading: false,
        cards: cards,
        categories: categories,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
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
