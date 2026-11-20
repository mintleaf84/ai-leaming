import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import 'agent_set_practice_controller.dart';
import 'widgets/agent_set_action_bar.dart';
import 'widgets/agent_set_dialogs.dart';
import 'widgets/agent_set_error_banner.dart';
import 'widgets/agent_set_finished_view.dart';
import 'widgets/agent_set_progress_header.dart';
import 'widgets/agent_set_question_view.dart';

/// 题集练习屏：逐题作答 + 报错 + 一键成卷 + 转正入库。
///
/// 判分复用练习接口（见控制器），所以这里没有「交卷」这一步：每题判完立即
/// 知道对错，符合契约 §4.2「逐题即时判分」。
class AgentSetPracticeScreen extends ConsumerStatefulWidget {
  const AgentSetPracticeScreen({super.key, required this.setId});

  final int setId;

  @override
  ConsumerState<AgentSetPracticeScreen> createState() =>
      _AgentSetPracticeScreenState();
}

class _AgentSetPracticeScreenState
    extends ConsumerState<AgentSetPracticeScreen> {
  AgentSetPracticeController get _controller =>
      ref.read(agentSetPracticeControllerProvider(widget.setId).notifier);

  AgentSetPracticeState get _state =>
      ref.read(agentSetPracticeControllerProvider(widget.setId));

  Future<void> _onFlag() async {
    final messenger = ScaffoldMessenger.of(context);
    final reason = await showAgentSetFlagDialog(context);
    // null 是「取消」；空串是「确认但没填原因」——两者语义不同，都要精确区分。
    if (reason == null || !mounted) return;
    final remaining = await _controller.flagCurrent(reason: reason);
    if (!mounted || remaining == null) return; // 失败原因在 state.actionError 里
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          remaining > 0 ? '已移出这道题，还剩 $remaining 题' : '已移出这道题，这套题没有可做的题了',
        ),
      ),
    );
  }

  Future<void> _onCreatePaper() async {
    final remaining = _state.remaining;
    if (!await showAgentSetPaperConfirm(context, remaining: remaining)) return;
    if (!mounted) return;
    final paper = await _controller.createPaper();
    if (!mounted || paper == null) return;
    context.pushDetail(AppRoutes.examPaper(paper.paperId));
  }

  Future<void> _onPromote() async {
    final messenger = ScaffoldMessenger.of(context);
    final count = _state.set?.questionCount ?? _state.total;
    if (!await showAgentSetPromoteConfirm(context, count: count)) return;
    if (!mounted) return;
    final result = await _controller.promote();
    if (!mounted || result == null) return;
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          result.questionCount == null
              ? '已转正入库，可以在题库里找到这些题了'
              : '已转正 ${result.questionCount} 道题，可以在题库里找到它们了',
        ),
      ),
    );
  }

  void _onPrimary() {
    final state = _state;
    if (state.isJudged) {
      _controller.next();
      return;
    }
    _controller.submitCurrent();
  }

  @override
  Widget build(BuildContext context) {
    final provider = agentSetPracticeControllerProvider(widget.setId);
    final state = ref.watch(provider);
    final controller = ref.read(provider.notifier);
    final colors = context.colors;
    final title = state.set?.title ?? 'AI 题集';

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 17.sp,
            fontWeight: FontWeight.w600,
            color: colors.text,
          ),
        ),
        centerTitle: true,
        actions: [
          if (state.phase != AgentSetPracticePhase.loading)
            IconButton(
              tooltip: '刷新这套题',
              icon: Icon(AppIcons.refresh, color: colors.text),
              onPressed: controller.load,
            ),
        ],
      ),
      body: _buildBody(state, controller),
      bottomNavigationBar:
          state.phase == AgentSetPracticePhase.ready && state.current != null
          ? AgentSetActionBar(
              judged: state.isJudged,
              isLastQuestion: state.isLastQuestion,
              canSubmit: state.canSubmit,
              submitting: state.submitting,
              creatingPaper: state.creatingPaper,
              promoting: state.promoting,
              promoted: state.set?.isPromoted ?? false,
              remaining: state.remaining,
              onPrimary: _onPrimary,
              onCreatePaper: _onCreatePaper,
              onPromote: _onPromote,
            )
          : null,
    );
  }

  Widget _buildBody(
    AgentSetPracticeState state,
    AgentSetPracticeController controller,
  ) {
    switch (state.phase) {
      case AgentSetPracticePhase.loading:
        return const Center(child: CircularProgressIndicator());
      case AgentSetPracticePhase.error:
        return AppErrorView(
          message: state.loadError ?? '请检查网络后重试',
          onRetry: controller.load,
        );
      case AgentSetPracticePhase.finished:
        return AgentSetFinishedView(
          set: state.set,
          answeredCount: state.answeredCount,
          correctCount: state.correctCount,
          flaggedCount: state.flaggedCount,
          creatingPaper: state.creatingPaper,
          promoting: state.promoting,
          onBackToList: () => context.backOrHome(),
          onCreatePaper: _onCreatePaper,
          onPromote: _onPromote,
        );
      case AgentSetPracticePhase.ready:
        final question = state.current;
        if (question == null) {
          // 理论上不会走到（题被移空时 phase 已转 finished），留一条兜底：
          // 没有当前题就承认「没有题」，而不是渲染一个空白的作答区。
          return const AppEmptyView(title: '这套题没有待做的题了');
        }
        return Column(
          children: [
            AgentSetProgressHeader(
              position: state.position,
              total: state.total,
              remaining: state.remaining,
              progress: state.progress,
              correctCount: state.correctCount,
              answeredCount: state.answeredCount,
            ),
            if (state.actionError != null)
              AgentSetErrorBanner(
                message: state.actionError!,
                onDismiss: controller.clearActionError,
              ),
            Expanded(
              child: AgentSetQuestionView(
                // 每换一题重建一次：选中态/动画控制器都跟着题走，
                // 不重建会让上一题的弹跳动画残留到下一题。
                key: ValueKey<String>('agent_set_question_${question.id}'),
                question: question,
                selected: state.selected,
                outcome: state.outcome,
                submitting: state.submitting,
                flagging: state.flagging,
                onSelect: controller.toggleOption,
                onFlag: _onFlag,
              ),
            ),
            if (state.outcome != null)
              AgentSetJudgePanel(outcome: state.outcome!),
          ],
        );
    }
  }
}
