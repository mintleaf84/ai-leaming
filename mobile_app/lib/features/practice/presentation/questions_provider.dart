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

  const QuestionsState({
    this.items = const [],
    this.total = 0,
    this.isLoading = false,
    this.error,
    this.currentPage = 1,
    this.hasMore = true,
  });

  QuestionsState copyWith({
    List<Question>? items,
    int? total,
    bool? isLoading,
    String? error,
    int? currentPage,
    bool? hasMore,
  }) {
    return QuestionsState(
      items: items ?? this.items,
      total: total ?? this.total,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
    );
  }
}

class QuestionsController extends Notifier<QuestionsState> {
  static const int _limit = 20;

  @override
  QuestionsState build() {
    // Initial fetch
    Future.microtask(() => fetchQuestions());
    return const QuestionsState();
  }

  PracticeRepository get _repository => ref.read(practiceRepositoryProvider);

  Future<void> fetchQuestions({bool isRefresh = false}) async {
    if (state.isLoading) return;

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
      );

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
}

final questionsControllerProvider =
    NotifierProvider<QuestionsController, QuestionsState>(
      QuestionsController.new,
    );
