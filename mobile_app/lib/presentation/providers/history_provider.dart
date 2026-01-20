import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/dio_client.dart';
import '../../data/datasources/api_client.dart';

/// 历史记录项
class HistoryItem {
  final String id;
  final String? sessionName;
  final int totalQuestions;
  final int correctCount;
  final int reviewCount;
  final String createdAt;
  final int accuracy;
  final String? practiceMode;

  HistoryItem({
    required this.id,
    this.sessionName,
    required this.totalQuestions,
    required this.correctCount,
    required this.reviewCount,
    required this.createdAt,
    required this.accuracy,
    this.practiceMode,
  });

  factory HistoryItem.fromJson(Map<String, dynamic> json) {
    return HistoryItem(
      id: json['id'] as String,
      sessionName: json['sessionName'] as String?,
      totalQuestions: json['totalQuestions'] as int,
      correctCount: json['correctCount'] as int,
      reviewCount: json['reviewCount'] as int? ?? 0,
      createdAt: json['createdAt'] as String,
      accuracy: json['accuracy'] as int,
      practiceMode: json['practiceMode'] as String?,
    );
  }
}

/// 历史列表状态
class HistoryListState {
  final List<HistoryItem> items;
  final int total;
  final int page;
  final int pageSize;
  final bool isLoading;
  final bool hasMore;
  final String? error;

  const HistoryListState({
    this.items = const [],
    this.total = 0,
    this.page = 1,
    this.pageSize = 10,
    this.isLoading = false,
    this.hasMore = true,
    this.error,
  });

  HistoryListState copyWith({
    List<HistoryItem>? items,
    int? total,
    int? page,
    int? pageSize,
    bool? isLoading,
    bool? hasMore,
    String? error,
  }) {
    return HistoryListState(
      items: items ?? this.items,
      total: total ?? this.total,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      error: error,
    );
  }
}

/// 历史记录控制器 (Riverpod 3.x Notifier pattern)
class HistoryController extends Notifier<HistoryListState> {
  @override
  HistoryListState build() => const HistoryListState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载第一页
  Future<void> loadHistory() async {
    state = state.copyWith(isLoading: true, error: null, page: 1);

    try {
      final response = await _apiClient.getHistory(1, state.pageSize);

      final items = (response['items'] as List<dynamic>)
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final total = response['total'] as int;
      final totalPages = response['totalPages'] as int;

      state = state.copyWith(
        isLoading: false,
        items: items,
        total: total,
        page: 1,
        hasMore: 1 < totalPages,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 加载更多
  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;

    final nextPage = state.page + 1;
    state = state.copyWith(isLoading: true);

    try {
      final response = await _apiClient.getHistory(nextPage, state.pageSize);

      final newItems = (response['items'] as List<dynamic>)
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final totalPages = response['totalPages'] as int;

      state = state.copyWith(
        isLoading: false,
        items: [...state.items, ...newItems],
        page: nextPage,
        hasMore: nextPage < totalPages,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 刷新
  Future<void> refresh() async {
    state = const HistoryListState();
    await loadHistory();
  }
}

/// Provider (Riverpod 3.x pattern)
final historyControllerProvider =
    NotifierProvider<HistoryController, HistoryListState>(
      HistoryController.new,
    );
