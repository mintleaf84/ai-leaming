import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/practice_repository.dart';
import '../data/practice_repository_impl.dart';
import '../domain/question.dart';

class QuestionsState {
  final List<Question> items;
  final int total;
  final bool isLoading;
  final String? error;
  final int currentPage;
  final bool hasMore;
  /// 搜索关键词（空串表示不过滤）。后端 `GET /questions?search=` 已支持。
  final String search;

  const QuestionsState({
    this.items = const [],
    this.total = 0,
    this.isLoading = false,
    this.error,
    this.currentPage = 1,
    this.hasMore = true,
    this.search = '',
  });

  QuestionsState copyWith({
    List<Question>? items,
    int? total,
    bool? isLoading,
    String? error,
    int? currentPage,
    bool? hasMore,
    String? search,
  }) {
    return QuestionsState(
      items: items ?? this.items,
      total: total ?? this.total,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      search: search ?? this.search,
    );
  }
}

class QuestionsController extends Notifier<QuestionsState> {
  static const int _limit = 20;

  /// 请求代次：切换关键词/刷新时自增，迟到的旧响应据此丢弃，
  /// 否则旧关键词的结果会覆盖新一次的列表。
  int _requestGeneration = 0;

  @override
  QuestionsState build() {
    // Initial fetch
    Future.microtask(() => fetchQuestions());
    return const QuestionsState();
  }

  PracticeRepository get _repository => ref.read(practiceRepositoryProvider);

  Future<void> fetchQuestions({bool isRefresh = false}) async {
    // 分页时挡重复请求；刷新/换关键词必须放行（此时 isLoading 可能是上一轮留下的）
    if (state.isLoading && !isRefresh) return;
    final generation = ++_requestGeneration;

    if (isRefresh) {
      state = state.copyWith(
        isLoading: true,
        currentPage: 1,
        hasMore: true,
        error: null,
      );
    } else {
      if (!state.hasMore) return;
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getQuestions(
        page: state.currentPage,
        limit: _limit,
        search: state.search.isEmpty ? null : state.search,
      );

      if (generation != _requestGeneration) {
        return; // 已有更新的一次请求，丢弃本次响应
      }

      final newItems = isRefresh
          ? response.items
          : [...state.items, ...response.items];

      state = state.copyWith(
        isLoading: false,
        items: newItems,
        total: response.total,
        currentPage: state.currentPage + 1,
        hasMore: newItems.length < response.total,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() async {
    await fetchQuestions(isRefresh: true);
  }

  /// 按关键词重新检索（清空当前列表并从第 1 页开始）。
  Future<void> applySearch(String keyword) async {
    state = state.copyWith(
      search: keyword.trim(),
      items: const [],
      total: 0,
      currentPage: 1,
      hasMore: true,
      error: null,
    );
    await fetchQuestions(isRefresh: true);
  }
}

final questionsControllerProvider =
    NotifierProvider<QuestionsController, QuestionsState>(
      QuestionsController.new,
    );
