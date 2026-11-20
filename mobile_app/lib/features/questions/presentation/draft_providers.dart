import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/user_message.dart';
import '../data/question_editor_repository.dart';
import '../domain/question_draft.dart';

/// 草稿列表状态（§34.3 列表页）。
class DraftListState {
  const DraftListState({
    this.items = const <QuestionDraftSummary>[],
    this.isLoading = false,
    this.error,
  });

  final List<QuestionDraftSummary> items;
  final bool isLoading;
  final String? error;

  bool get isEmpty => items.isEmpty;

  DraftListState copyWith({
    List<QuestionDraftSummary>? items,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return DraftListState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// 草稿列表控制器。
///
/// 列表页每次进入都会 `load()`：识别是服务端异步跑的，用户「拍照 → 退出 →
/// 想起来再进来」是正常路径，靠本地缓存会一直显示「识别中」。
class DraftListController extends Notifier<DraftListState> {
  /// 请求代次：刷新与「返回列表后重新拉」可能并发，迟到的旧响应必须丢弃。
  int _requestSeq = 0;

  @override
  DraftListState build() => const DraftListState();

  QuestionEditorRepository get _repository =>
      ref.read(questionEditorRepositoryProvider);

  Future<void> load() async {
    final seq = ++_requestSeq;
    _set(state.copyWith(isLoading: true, clearError: true));

    try {
      final items = await _repository.listDrafts();
      if (seq != _requestSeq) return;
      _set(DraftListState(items: items));
    } catch (error) {
      if (seq != _requestSeq) return;
      // 原始异常只进日志，界面用统一文案（审计 #24）。
      debugPrint('[Drafts] 加载草稿列表失败: $error');
      _set(state.copyWith(isLoading: false, error: userMessageOf(error)));
    }
  }

  void _set(DraftListState next) {
    if (!ref.mounted) return;
    state = next;
  }
}

final draftListControllerProvider =
    NotifierProvider<DraftListController, DraftListState>(
      DraftListController.new,
    );

/// 草稿校对页状态（§34.3 校对页）。
class DraftReviewState {
  const DraftReviewState({
    this.draft,
    this.isLoading = false,
    this.isConfirming = false,
    this.savingIdx,
    this.error,
    this.actionError,
    this.confirmResult,
  });

  final QuestionDraft? draft;
  final bool isLoading;
  final bool isConfirming;

  /// 正在保存的那一条（用于禁用该卡片的按钮）。
  final int? savingIdx;

  /// 首屏加载失败（整页错误视图）。
  final String? error;

  /// 单条保存 / 确认 / 重试失败：留在页内提示，不清空已上屏数据。
  final String? actionError;

  /// `confirm` 的结果：`created` / `skipped` 要显示给用户。
  final DraftConfirmResult? confirmResult;

  bool get isBusy => isLoading || isConfirming || savingIdx != null;

  DraftReviewState copyWith({
    QuestionDraft? draft,
    bool? isLoading,
    bool? isConfirming,
    int? savingIdx,
    String? error,
    String? actionError,
    DraftConfirmResult? confirmResult,
    bool clearSavingIdx = false,
    bool clearError = false,
    bool clearActionError = false,
    bool clearConfirmResult = false,
  }) {
    return DraftReviewState(
      draft: draft ?? this.draft,
      isLoading: isLoading ?? this.isLoading,
      isConfirming: isConfirming ?? this.isConfirming,
      savingIdx: clearSavingIdx ? null : (savingIdx ?? this.savingIdx),
      error: clearError ? null : (error ?? this.error),
      actionError: clearActionError ? null : (actionError ?? this.actionError),
      confirmResult: clearConfirmResult
          ? null
          : (confirmResult ?? this.confirmResult),
    );
  }
}

/// 单份草稿的校对状态。用 family 而不是页面本地 state：
///
/// - 页面被 push 进来时 `build()` 自动拉一次详情，「识别中退出再进来」
///   走的就是这条路径（重新 GET，不需要轮询定时器）；
/// - 保存/删除/确认之后统一 `load()` 回读服务端结果，避免客户端自己拼状态
///   与服务端漂移（例如服务端把某条判成跳过）。
class DraftReviewController extends Notifier<DraftReviewState> {
  DraftReviewController(this.draftId);

  final String draftId;

  @override
  DraftReviewState build() {
    Future.microtask(load);
    return const DraftReviewState();
  }

  QuestionEditorRepository get _repository =>
      ref.read(questionEditorRepositoryProvider);

  Future<void> load() async {
    _set(state.copyWith(isLoading: true, clearError: true));
    try {
      final draft = await _repository.fetchDraft(draftId);
      _set(state.copyWith(isLoading: false, draft: draft));
    } catch (error) {
      debugPrint('[DraftReview] 加载草稿失败: $error');
      _set(state.copyWith(isLoading: false, error: userMessageOf(error)));
    }
  }

  /// 保存单条（含「确认入库」勾选）。返回是否成功，页面据此决定要不要提示。
  Future<bool> saveItem(QuestionDraftItem item) async {
    _set(
      state.copyWith(
        savingIdx: item.idx,
        clearActionError: true,
        clearConfirmResult: true,
      ),
    );
    try {
      await _repository.updateDraftItem(draftId, item.idx, item.toPatchPayload());
      await load();
      _set(state.copyWith(clearSavingIdx: true));
      return true;
    } catch (error) {
      debugPrint('[DraftReview] 保存第 ${item.idx} 条失败: $error');
      _set(
        state.copyWith(
          clearSavingIdx: true,
          actionError: userMessageOf(error),
        ),
      );
      return false;
    }
  }

  /// 只改「确认入库」勾选：不算一次编辑，失败要让用户看见。
  Future<void> toggleConfirmed(QuestionDraftItem item, bool confirmed) async {
    _set(state.copyWith(savingIdx: item.idx, clearActionError: true));
    try {
      await _repository.updateDraftItem(draftId, item.idx, <String, dynamic>{
        'confirmed': confirmed,
      });
      await load();
    } catch (error) {
      debugPrint('[DraftReview] 切换第 ${item.idx} 条确认状态失败: $error');
      _set(state.copyWith(actionError: userMessageOf(error)));
    } finally {
      _set(state.copyWith(clearSavingIdx: true));
    }
  }

  Future<void> deleteItem(int idx) async {
    _set(state.copyWith(savingIdx: idx, clearActionError: true));
    try {
      await _repository.deleteDraftItem(draftId, idx);
      await load();
    } catch (error) {
      debugPrint('[DraftReview] 删除第 $idx 条失败: $error');
      _set(state.copyWith(actionError: userMessageOf(error)));
    } finally {
      _set(state.copyWith(clearSavingIdx: true));
    }
  }

  /// 全部确认入库（只提交 `confirmed` 的条目，事务由服务端保证）。
  Future<void> confirmAll() async {
    _set(
      state.copyWith(
        isConfirming: true,
        clearActionError: true,
        clearConfirmResult: true,
      ),
    );
    try {
      final result = await _repository.confirmDraft(draftId);
      _set(
        state.copyWith(isConfirming: false, confirmResult: result),
      );
      await load();
    } catch (error) {
      debugPrint('[DraftReview] 确认入库失败: $error');
      _set(
        state.copyWith(isConfirming: false, actionError: userMessageOf(error)),
      );
    }
  }

  /// 识别失败后重试（`POST /analyze`）。服务端若同步返回草稿就直接用。
  Future<void> retryAnalyze() async {
    _set(state.copyWith(isLoading: true, clearActionError: true));
    try {
      final draft = await _repository.analyzeDraft(draftId);
      if (draft != null) {
        _set(state.copyWith(isLoading: false, draft: draft));
      } else {
        await load();
      }
    } catch (error) {
      debugPrint('[DraftReview] 重新识别失败: $error');
      _set(
        state.copyWith(isLoading: false, actionError: userMessageOf(error)),
      );
    }
  }

  /// 丢弃整份草稿（软删除）。成功后由页面负责返回上一页。
  Future<bool> discard() async {
    _set(state.copyWith(isLoading: true, clearActionError: true));
    try {
      await _repository.discardDraft(draftId);
      _set(state.copyWith(isLoading: false));
      return true;
    } catch (error) {
      debugPrint('[DraftReview] 丢弃草稿失败: $error');
      _set(
        state.copyWith(isLoading: false, actionError: userMessageOf(error)),
      );
      return false;
    }
  }

  void _set(DraftReviewState next) {
    if (!ref.mounted) return;
    state = next;
  }
}

final draftReviewControllerProvider =
    NotifierProvider.family<DraftReviewController, DraftReviewState, String>(
      DraftReviewController.new,
    );
