import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import 'agent_sets_controller.dart';
import 'widgets/agent_set_card.dart';
import 'widgets/agent_set_error_banner.dart';

/// AI 题集列表：外部 Agent 推来的题集，一套一张卡。
///
/// 右侧的「剩 N 题 / 上次成绩」必须来自服务端（`pendingCount` / `lastScore`），
/// 取不到就写「还没做过」——不编一个看起来合理的分数（与首页三卡同一纪律）。
class AgentSetsScreen extends ConsumerStatefulWidget {
  const AgentSetsScreen({super.key});

  @override
  ConsumerState<AgentSetsScreen> createState() => _AgentSetsScreenState();
}

class _AgentSetsScreenState extends ConsumerState<AgentSetsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (!mounted) return;
      ref.read(agentSetsControllerProvider.notifier).load();
    });
  }

  Future<void> _refresh() async {
    await ref.read(agentSetsControllerProvider.notifier).load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(agentSetsControllerProvider);
    final colors = context.colors;

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
          'AI 题集',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: colors.text,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: '刷新题集',
            icon: Icon(AppIcons.refresh, color: colors.text),
            onPressed: _refresh,
          ),
        ],
      ),
      body: _buildBody(context, state),
    );
  }

  Widget _buildBody(BuildContext context, AgentSetsState state) {
    if (state.phase == AgentSetsPhase.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.phase == AgentSetsPhase.error) {
      return AppErrorView(
        message: state.errorMessage ?? '请检查网络后重试',
        onRetry: () => ref.read(agentSetsControllerProvider.notifier).load(),
      );
    }

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        // 空列表也要能下拉，否则空态变成一个「拉不动」的死屏。
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.h),
        children: [
          if (state.errorMessage != null && state.isEmpty)
            AgentSetErrorBanner(message: state.errorMessage!),
          if (state.isEmpty)
            SizedBox(
              height: 380.h,
              child: AppEmptyView(
                emoji: '🤖',
                title: '还没有 AI 题集',
                hint:
                    '外部 Agent 推来的题会出现在这里：能逐题做、'
                    '标「这题有问题」，还能一键成卷。',
                actionLabel: '刷新',
                onAction: () =>
                    ref.read(agentSetsControllerProvider.notifier).load(),
              ),
            )
          else ...[
            _buildSummary(context, state),
            SizedBox(height: 12.h),
            for (final set in state.sets) ...[
              AgentSetCard(set: set, onTap: () => _openSet(set.id)),
              SizedBox(height: 12.h),
            ],
            if (state.errorMessage != null) ...[
              SizedBox(height: 4.h),
              AgentSetErrorBanner(message: state.errorMessage!),
            ],
            SizedBox(height: 24.h),
          ],
        ],
      ),
    );
  }

  /// 顶部一行汇总：多少套、多少道没看。数字来自同一份列表，不额外交互。
  Widget _buildSummary(BuildContext context, AgentSetsState state) {
    final colors = context.colors;
    final unread = state.unreadTotal;
    return Row(
      children: [
        Text(
          '共 ${state.sets.length} 套',
          style: TextStyle(
            fontSize: 13.sp,
            fontWeight: FontWeight.w600,
            color: colors.textSecondary,
          ),
        ),
        const Spacer(),
        if (unread > 0)
          Text(
            '$unread 道没看过',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w600,
              color: colors.error,
            ),
          )
        else
          Text(
            '都看过了',
            style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
          ),
      ],
    );
  }

  void _openSet(int setId) {
    context.pushDetail(
      AppRoutes.agentSet(setId),
      // 返回时重拉：未做数、未读数、上次成绩都可能刚变过。
      onReturn: () =>
          ref.read(agentSetsControllerProvider.notifier).load(silent: true),
    );
  }
}
