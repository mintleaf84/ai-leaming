import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_icons.dart';
import '../domain/recall_review.dart';
import 'recall_session_controller.dart';
import 'widgets/recall_action_bar.dart';
import 'widgets/recall_done_view.dart';
import 'widgets/recall_header.dart';
import 'widgets/recall_judge_view.dart';
import 'widgets/recall_queue_ready_view.dart';
import 'widgets/recall_question_view.dart';
import 'widgets/recall_state_views.dart';

/// 回忆自测的页面骨架。
///
/// 本文件只做三件事：把状态机阶段映射到屏、把按钮接到意图、把结果块滚进视野。
/// 状态机在 `recall_session_controller.dart`，屏在 `widgets/`。
///
/// 页面级约束（规格 §3）：不出现评分按钮、正确率、等级、徽章。
/// 用户只看到「下次 11 月 20 日」与「明天只重测这 3 条」。
class RecallSessionScreen extends ConsumerStatefulWidget {
  const RecallSessionScreen({super.key, this.onExit});

  /// 离开回忆页的方式；默认走 `Navigator`，接路由时由调用方覆盖。
  final VoidCallback? onExit;

  @override
  ConsumerState<RecallSessionScreen> createState() =>
      _RecallSessionScreenState();
}

class _RecallSessionScreenState extends ConsumerState<RecallSessionScreen> {
  /// 结论块的位置：判分屏可能比一屏高，结论落地后主动滚过去，
  /// 不然「下次 11 月 20 日」只存在于屏幕外面。
  final GlobalKey _resultKey = GlobalKey();

  RecallSessionController get _controller =>
      ref.read(recallSessionControllerProvider.notifier);

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (!mounted) return;
      _controller.loadQueue();
    });
  }

  /// 离开回忆页。
  ///
  /// 默认走 [AppNav.backOrHome]：从首页 pushDetail 进来的（现在就是这样）会返回首页，
  /// 万一将来把 /recall 当独立入口打开、栈里没有上一页，也不会"点了没反应"。
  void _exit() {
    final custom = widget.onExit;
    if (custom != null) {
      custom();
      return;
    }
    context.backOrHome();
  }

  // ==================== 归档 ====================

  /// 归档需要二次确认。
  ///
  /// 没有选「SnackBar 可撤销」：归档会立刻把这张卡移出本次队列并推进到下一张，
  /// 撤销时卡虽然回到队列，却已经不在本次的 `pending` 里——用户会以为撤销没生效。
  /// 一次明确确认比一个骗人的撤销按钮诚实。
  Future<void> _confirmArchive() async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('归档这张卡'),
        content: const Text('归档后它不再出现在复习队列里，已经复习过的记录会保留。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('归档'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final error = await _controller.archiveCurrent();
    if (!mounted) return;
    messenger.showSnackBar(
      SnackBar(
        // 控制器返回的已经是整句（含"这张卡已经不在了"这类结果说明）
        content: Text(error ?? '已归档，继续下一张。'),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  // ==================== 全没想起 ====================

  /// 作答屏直接「全没想起」：先确认，再一次性提交。
  ///
  /// 为什么在作答屏要确认、在判分屏不用：作答屏这个按钮离主操作很近，误触的代价是
  /// 一次真实的调度写入（评分 again、日志落库），而用户还没看到任何条目；
  /// 判分屏上他已经看着逐条结果，再点一次"全没想起"就是明确的意思表示。
  Future<void> _confirmAllBlank() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('全部算没想起来？'),
        content: const Text('这张卡会按「一条都没写」记下来，明天会单独重测这些条目。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('再想想'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('就这样'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _controller.submitAllBlankFromQuestion();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(recallSessionControllerProvider);

    // 结论刚落地：把它滚进视野（只做一次，靠 result 从 null 变非 null 触发）
    ref.listen<RecallReviewResult?>(
      recallSessionControllerProvider.select((value) => value.result),
      (previous, next) {
        if (previous != null || next == null) return;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final target = _resultKey.currentContext;
          if (target == null) return;
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            alignment: 0.92,
          );
        });
      },
    );

    return Scaffold(
      appBar: AppBar(title: const Text('回忆自测')),
      body: SafeArea(bottom: false, child: _buildPhase(state)),
    );
  }

  Widget _buildPhase(RecallSessionState state) {
    switch (state.phase) {
      case RecallPhase.idle:
      case RecallPhase.loadingQueue:
      case RecallPhase.loadingCard:
        return const RecallSkeleton();

      case RecallPhase.queueReady:
        return _withActionBar(
          RecallQueueReadyView(
            total: state.total,
            due: state.queue?.due ?? 0,
            fresh: state.queue?.fresh ?? 0,
            estimatedMinutes: state.queue?.estimatedMinutes ?? 0,
            streakDays: state.queue?.streakDays ?? 0,
            doneCount: state.doneCount,
          ),
          RecallPrimaryButton(
            label: state.doneCount > 0 ? '继续' : '开始',
            onPressed: () => _controller.start(),
          ),
        );

      case RecallPhase.question:
        return _buildAnswerFlow(
          state,
          RecallQuestionView(
            key: ValueKey<int>(state.card?.cardId ?? -1),
            card: state.card!,
            initialTyped: state.typed,
            onTypedChanged: _controller.setTyped,
            onArchive: _confirmArchive,
            archiving: state.archiving,
          ),
          RecallDualActions(
            primary: RecallPrimaryButton(
              label: '看看对不对',
              onPressed: state.archiving ? null : () => _controller.reveal(),
            ),
            secondary: RecallSecondaryButton(
              label: '全没想起',
              onPressed: state.archiving ? null : _confirmAllBlank,
            ),
          ),
        );

      case RecallPhase.judge:
        return _buildAnswerFlow(
          state,
          RecallJudgeView(
            card: state.card!,
            presented: state.presented,
            algoVerdicts: state.algoVerdicts,
            verdicts: state.finalVerdicts,
            segments: state.segments,
            submitError: state.submitError,
            submitting: state.submitting,
            retryLocked: state.retryLocked,
            submitRejected: state.submitRejected,
            result: state.result,
            resultKey: _resultKey,
            onToggle: _controller.toggleVerdict,
          ),
          _buildJudgeActions(state),
        );

      case RecallPhase.done:
        return _withActionBar(
          RecallDoneView(
            result: state.result,
            note: state.lastNote,
            pendingItems: state.lastPendingItems,
            streakDays: state.queue?.streakDays ?? 0,
          ),
          RecallPrimaryButton(label: '返回', onPressed: _exit),
        );

      case RecallPhase.empty:
        return RecallEmptyView(
          streakDays: state.queue?.streakDays ?? 0,
          onRefresh: () => _controller.loadQueue(),
        );

      case RecallPhase.error:
        // 不再自己判断"有没有上一页"：/recall 由 pushDetail 进入，backOrHome
        // 保证没有上一页时也会回首页，所以「先回去」永远可用。
        return RecallErrorView(
          message: state.errorMessage ?? '稍后再试一次。',
          onRetry: () => _controller.retryLoad(),
          onBack: _exit,
        );
    }
  }

  /// 作答 / 判分两屏共用的骨架：顶部进度 + 可滚动正文 + 固定底栏。
  Widget _buildAnswerFlow(
    RecallSessionState state,
    Widget body,
    Widget actions,
  ) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: EdgeInsets.only(bottom: 8.h),
            child: Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 12.h),
                  child: RecallHeader(
                    total: state.total,
                    doneCount: state.doneCount,
                    estimatedMinutes: state.queue?.estimatedMinutes ?? 0,
                    streakDays: state.queue?.streakDays ?? 0,
                    lastNote: state.phase == RecallPhase.question
                        ? state.lastNote
                        : null,
                  ),
                ),
                body,
              ],
            ),
          ),
        ),
        RecallActionBar(child: actions),
      ],
    );
  }

  Widget _withActionBar(Widget body, Widget action) {
    return Column(
      children: [
        Expanded(child: body),
        RecallActionBar(child: action),
      ],
    );
  }

  /// 判分屏底栏的四种形态。
  ///
  /// 提交中不放转圈、只换文案：主按钮保持原位，用户的眼睛不需要重新找。
  Widget _buildJudgeActions(RecallSessionState state) {
    if (state.result != null) {
      final hasNext = state.pending.length > 1;
      return RecallPrimaryButton(
        label: hasNext ? '下一张' : '完成',
        icon: hasNext ? AppIcons.arrowForward : null,
        onPressed: state.archiving ? null : () => _controller.advance(),
      );
    }

    if (state.submitRejected) {
      // 被服务端拒绝：这份作答已经作废，重发必然再被拒。给一条真正的出口，
      // 而不是让用户对着永远不成功的「重试」点。
      return RecallDualActions(
        primary: RecallPrimaryButton(
          label: '跳过这张',
          onPressed: () => _controller.skipRejectedCard(),
        ),
        secondary: RecallSecondaryButton(
          label: '留在这里',
          onPressed: () => _controller.dismissSubmitFailure(),
        ),
      );
    }

    if (state.retryLocked) {
      // 结果未知：只留「重试」。此时连"全没想起"都藏起来——它会让服务端按
      // 同一个 clientKey 重放首次结果，界面却以为是另一种提交方式。
      return RecallPrimaryButton(
        label: '重试提交',
        onPressed: state.submitting
            ? null
            : () => _controller.submit(allBlank: false),
      );
    }

    final submitting = state.submitting;
    return RecallDualActions(
      primary: RecallPrimaryButton(
        label: submitting ? '正在记下来…' : '确认结果',
        onPressed: submitting
            ? null
            : () => _controller.submit(allBlank: false),
      ),
      secondary: RecallSecondaryButton(
        label: '全没想起',
        onPressed: submitting ? null : () => _controller.submit(allBlank: true),
      ),
    );
  }
}
