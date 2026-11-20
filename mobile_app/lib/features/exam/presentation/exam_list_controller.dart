import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/exam_repository.dart';
import '../domain/exam_generate_rules.dart';
import '../domain/exam_paper.dart';
import 'exam_error_text.dart';

/// 试卷列表的界面阶段。
enum ExamListPhase {
  /// 首屏加载中（还没有任何数据）。
  loading,

  /// 有结果（`papers` 可能为空，空态由界面判定）。
  ready,

  /// 首屏加载失败。
  error,
}

/// 试卷列表状态（不可变快照）。
class ExamListState {
  final ExamListPhase phase;
  final List<ExamPaper> papers;

  /// 下拉刷新中（列表已有数据时不清屏，只显示刷新指示器）。
  final bool refreshing;

  /// 首屏加载失败的可读原因。
  final String? errorMessage;

  /// 自动组卷进行中：表单按钮禁用，避免生成两张重复的卷子。
  final bool generating;

  /// 自动组卷失败的可读原因（表单内联显示，不弹全屏错误）。
  final String? generateError;

  const ExamListState({
    this.phase = ExamListPhase.loading,
    this.papers = const [],
    this.refreshing = false,
    this.errorMessage,
    this.generating = false,
    this.generateError,
  });

  bool get isEmpty => papers.isEmpty;

  ExamListState copyWith({
    ExamListPhase? phase,
    List<ExamPaper>? papers,
    bool? refreshing,
    String? errorMessage,
    bool clearError = false,
    bool? generating,
    String? generateError,
    bool clearGenerateError = false,
  }) {
    return ExamListState(
      phase: phase ?? this.phase,
      papers: papers ?? this.papers,
      refreshing: refreshing ?? this.refreshing,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      generating: generating ?? this.generating,
      generateError: clearGenerateError
          ? null
          : (generateError ?? this.generateError),
    );
  }
}

/// 试卷列表控制器。
///
/// 只有两个写入口：
/// - [load]：首屏 / 下拉刷新 / 从作答返回时重取（作答会改 `attemptCount`）；
/// - [generate]：自动组卷。成功时把新卷插到列表头部并返回它，由界面负责跳转。
class ExamListController extends Notifier<ExamListState> {
  @override
  ExamListState build() => const ExamListState();

  ExamRepository get _repository => ref.read(examRepositoryProvider);

  /// 取列表。
  ///
  /// [silent] 用于「从预览/作答返回」：保留现有列表并显示刷新指示器，
  /// 不要把用户正在看的列表先清成骨架屏。首屏（列表为空）也走这个分支，
  /// 由 [ExamListPhase.loading] 负责骨架态。
  Future<void> load({bool silent = false}) async {
    final hasData = state.papers.isNotEmpty;
    if (!silent && !hasData) {
      state = state.copyWith(phase: ExamListPhase.loading, clearError: true);
    } else {
      state = state.copyWith(refreshing: true, clearError: true);
    }

    try {
      final page = await _repository.listPapers(limit: 50);
      if (!ref.mounted) return;
      state = state.copyWith(
        phase: ExamListPhase.ready,
        papers: page.papers,
        refreshing: false,
        clearError: true,
      );
    } catch (error) {
      if (!ref.mounted) return;
      state = state.copyWith(
        // 刷新失败但手里还有旧列表：保留列表，不清屏（错误由 SnackBar 之外的
        // 下拉指示器结束来体现；用户能继续点开旧卷子）。
        phase: hasData ? ExamListPhase.ready : ExamListPhase.error,
        refreshing: false,
        errorMessage: describeExamError(error),
      );
    }
  }

  /// 自动组卷。成功返回新卷（界面据此跳转预览），失败返回 null 并写 [generateError]。
  Future<ExamPaper?> generate(ExamGenerateRules rules) async {
    if (state.generating) return null;
    state = state.copyWith(generating: true, clearGenerateError: true);
    try {
      final detail = await _repository.generate(rules);
      if (!ref.mounted) return null;
      final existing = state.papers.where((p) => p.id != detail.paper.id);
      state = state.copyWith(
        phase: ExamListPhase.ready,
        papers: <ExamPaper>[detail.paper, ...existing],
        generating: false,
        clearGenerateError: true,
      );
      return detail.paper;
    } catch (error) {
      if (!ref.mounted) return null;
      state = state.copyWith(
        generating: false,
        generateError: describeExamError(error),
      );
      return null;
    }
  }

  /// 关掉表单时清掉上一次的失败原因，避免再打开时先看到旧红字。
  void clearGenerateError() {
    if (state.generateError == null) return;
    state = state.copyWith(clearGenerateError: true);
  }
}

/// 列表控制器 Provider。
///
/// `autoDispose`：离开试卷列表就丢快照，回来重新拉——作答次数与最近成绩都变了，
/// 缓存一份旧列表只会让用户以为「刚才那场没记上」。
final examListControllerProvider =
    NotifierProvider.autoDispose<ExamListController, ExamListState>(
      ExamListController.new,
    );
