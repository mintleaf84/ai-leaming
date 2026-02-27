import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/wrong_book_repository.dart';
import '../domain/wrong_question.dart';

/// 视图模式
enum WrongBookViewMode { list, byTag, mastered }

/// 错题本状态
class WrongBookState {
  final List<WrongQuestion> questions;
  final List<WrongQuestionsByTag> groupedByTag;
  final WrongBookStats stats;
  final Set<String> selectedIds;
  final WrongBookViewMode viewMode;
  final bool isLoading;
  final String? error;
  final bool isCreatingPractice;

  const WrongBookState({
    this.questions = const [],
    this.groupedByTag = const [],
    this.stats = const WrongBookStats(),
    this.selectedIds = const {},
    this.viewMode = WrongBookViewMode.list,
    this.isLoading = false,
    this.error,
    this.isCreatingPractice = false,
  });

  WrongBookState copyWith({
    List<WrongQuestion>? questions,
    List<WrongQuestionsByTag>? groupedByTag,
    WrongBookStats? stats,
    Set<String>? selectedIds,
    WrongBookViewMode? viewMode,
    bool? isLoading,
    String? error,
    bool? isCreatingPractice,
  }) {
    return WrongBookState(
      questions: questions ?? this.questions,
      groupedByTag: groupedByTag ?? this.groupedByTag,
      stats: stats ?? this.stats,
      selectedIds: selectedIds ?? this.selectedIds,
      viewMode: viewMode ?? this.viewMode,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isCreatingPractice: isCreatingPractice ?? this.isCreatingPractice,
    );
  }
}

/// 错题本控制器 (Riverpod 3.x Notifier pattern)
class WrongBookController extends Notifier<WrongBookState> {
  @override
  WrongBookState build() => const WrongBookState();

  WrongBookRepository get _repository => ref.read(wrongBookRepositoryProvider);

  /// 加载全部数据
  Future<void> loadData() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final results = await Future.wait([
        _repository.getWrongQuestions(),
        _repository.getWrongQuestionsByTag(),
        _repository.getStats(),
      ]);

      state = state.copyWith(
        questions: results[0] as List<WrongQuestion>,
        groupedByTag: results[1] as List<WrongQuestionsByTag>,
        stats: results[2] as WrongBookStats,
        isLoading: false,
      );
    } catch (e) {
      debugPrint('加载错题本失败: $e');
      state = state.copyWith(isLoading: false, error: '加载失败');
    }
  }

  /// 切换视图模式
  void setViewMode(WrongBookViewMode mode) {
    state = state.copyWith(viewMode: mode);
  }

  /// 切换选中状态
  void toggleSelect(String questionId) {
    final newIds = Set<String>.from(state.selectedIds);
    if (newIds.contains(questionId)) {
      newIds.remove(questionId);
    } else {
      newIds.add(questionId);
    }
    state = state.copyWith(selectedIds: newIds);
  }

  /// 全选/取消全选
  void selectAll() {
    if (state.selectedIds.length == state.questions.length) {
      state = state.copyWith(selectedIds: {});
    } else {
      state = state.copyWith(
        selectedIds: state.questions.map((q) => q.questionId).toSet(),
      );
    }
  }

  /// 创建错题练习会话，返回 sessionId
  Future<String?> startPractice() async {
    final ids = state.selectedIds.toList();
    if (ids.isEmpty) return null;

    state = state.copyWith(isCreatingPractice: true);
    try {
      final result = await _repository.createPractice(ids);
      state = state.copyWith(isCreatingPractice: false);

      if (result['success'] == true) {
        return result['sessionId'] as String?;
      }
      return null;
    } catch (e) {
      debugPrint('创建错题练习失败: $e');
      state = state.copyWith(isCreatingPractice: false);
      return null;
    }
  }

  /// 标记已掌握
  Future<void> markAsMastered(String questionId) async {
    try {
      await _repository.markAsMastered(questionId);
      await loadData();
    } catch (e) {
      debugPrint('标记已掌握失败: $e');
    }
  }

  /// 取消掌握
  Future<void> unmarkMastered(String questionId) async {
    try {
      await _repository.unmarkMastered(questionId);
      await loadData();
    } catch (e) {
      debugPrint('取消掌握失败: $e');
    }
  }
}

/// Provider (Riverpod 3.x NotifierProvider)
final wrongBookControllerProvider =
    NotifierProvider<WrongBookController, WrongBookState>(() {
      return WrongBookController();
    });
