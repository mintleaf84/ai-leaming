import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../../core/compat/contract_meta_repository.dart';
import '../../../core/network/connectivity_provider.dart';
import '../../../shared/providers/history_provider.dart';
import '../../practice/presentation/practice_resume_provider.dart';
import '../../recall/data/recall_providers.dart';
import '../../../shared/domain/learning_stats.dart';
import '../../../core/theme/app_colors.dart';
import '../../exam/presentation/exam_entry.dart';
import '../../agent_sets/presentation/agent_set_inbox_provider.dart';
import '../../agent_sets/presentation/agent_sets_entry.dart';
import '../../stats/presentation/stats_provider.dart';
import '../../../shared/repositories/wrong_book_repository.dart';
import '../../../shared/widgets/contract_gate.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import 'widgets/dashboard_action_grid.dart';
import 'widgets/dashboard_header.dart';
import 'widgets/dashboard_progress_card.dart';
import 'widgets/dashboard_resume_card.dart';
import 'widgets/dashboard_stats_error.dart';
import 'widgets/dashboard_todo_list.dart';

/// 首页：备考主路径的起点。
///
/// 三张功能卡右侧的数值**必须**来自真实数据（审计 §25 F1/F4）：
/// 写死「--」「几分钟」「回顾」会让用户以为数据没加载或坏了。取不到数据时
/// 显示「暂无」，而不是编一个看起来合理的数字。
///
/// 视听件按区块拆在 `widgets/` 下（纯搬移，无行为改动）：顶栏、入口区、
/// 断点卡、进度卡、待办清单、失败态各一份。统计区的三态分派与骨架屏
/// 留在这里——骨架假数据只允许屏直接引用（见 `skeleton_fakes.dart` 约定）。
class DashboardScreen extends HookConsumerWidget {
  const DashboardScreen({super.key});

  /// 每日目标题数（与统计区的进度卡同源，避免两处各写一个 20）。
  static const int dailyGoal = 20;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 页面挂载时加载统计数据
    useEffect(() {
      Future.microtask(() => ref.read(statsControllerProvider.notifier).load());
      return null;
    }, const []);

    // 最近一次练习时间：首页挂载即取一次。
    //
    // 不按「列表非空」判断数据新鲜度：练习结束后列表还是练习前的那一份。
    // 练习结束（`PracticeController.reset`）会主动让历史重新拉取，首页
    // watch 的是同一份状态，跟着更新（review B6）。
    useEffect(() {
      Future.microtask(
        () => ref.read(historyControllerProvider.notifier).loadHistory(),
      );
      return null;
    }, const []);

    final statsState = ref.watch(statsControllerProvider);
    // 能力协商：服务端明确说没有 `recall` 就隐藏入口（不是灰显后报错）。
    // 协商中/断网按"支持"处理，见 recallEntryAvailable。
    final showRecall = recallEntryAvailable(
      ref.watch(contractDecisionProvider).value,
    );
    // 试卷入口同一套能力协商：服务端说没有 `exam` 就隐藏（不是灰显后 404）。
    final showExam = examEntryAvailable(
      ref.watch(contractDecisionProvider).value,
    );
    // AI 题集：外部 Agent 推来的题。服务端还没上线这个能力时整张卡不出现。
    final showAgentSets = agentSetsEntryAvailable(
      ref.watch(contractDecisionProvider).value,
    );
    // 未读角标读的是「启动/回前台拉过的那一份」，首页自己不再发请求
    // （见 AgentSetInboxWatcher）。
    final agentSetInbox = ref.watch(agentSetInboxProvider);
    // 离线判定（审计 #20）：`AsyncValue` 首帧是 loading，拿不准按在线处理，
    // 理由见 connectivity_provider.dart。
    final isOnline = ref.watch(isOnlineProvider).value ?? true;

    // 三张卡的数据源。能力协商说没有 recall 时不发 `/recall/queue`
    // （条件 watch：省掉一个必然 404 的请求）。
    final recallQueue = showRecall ? ref.watch(recallQueueProvider) : null;
    final wrongTotal = ref.watch(wrongBookTotalProvider);
    final historyState = ref.watch(historyControllerProvider);
    // 未完成练习的断点：有就出「继续上次练习」，没有就不占位置。
    final resume = ref.watch(practiceResumeControllerProvider);

    return Scaffold(
      backgroundColor: context.colors.background, // Notion-like background
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 24.w),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(height: 16.h),
                    // Header
                    const DashboardHeader(),
                    SizedBox(height: 24.h),
                    // Divider
                    Divider(height: 1.h, color: context.colors.border),
                    SizedBox(height: 24.h),
                    // 未完成练习：入口放在功能卡之前——它比任何一张卡都更接近
                    // 「今天还剩几题」这件事。
                    if (resume != null) ...[
                      DashboardResumeCard(resume: resume),
                      SizedBox(height: 16.h),
                    ],
                    // Action Grid
                    DashboardActionGrid(
                      showRecall: showRecall,
                      showExam: showExam,
                      showAgentSets: showAgentSets,
                      agentSetInbox: agentSetInbox,
                      isOnline: isOnline,
                      recallQueue: recallQueue,
                      wrongTotal: wrongTotal,
                      lastPracticeAt: _lastPracticeAt(historyState),
                    ),
                    SizedBox(height: 32.h),
                    // Progress Card + Todo List（统计区三态：骨架 / 错误 / 数据）
                    _buildStatsSection(context, ref, statsState),
                    // 底部导航由 AppShell 持有（不在这里画），
                    // 留 24 的呼吸位即可，不再为浮层导航预留 100。
                    SizedBox(height: 24.h),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 最近一次练习时间；没有记录或解析失败时返回 null。
  DateTime? _lastPracticeAt(HistoryListState state) {
    if (state.items.isEmpty) return null;
    return DateTime.tryParse(state.items.first.createdAt)?.toLocal();
  }

  /// 统计区（今日进度卡 + 待办清单）的三态（见审计 #4）。
  ///
  /// 问题：这两个区块原来完全没有 loading / error 分支，断网时渲染的是
  /// `LearningStats.empty`——「今日目标：尚未开始 0%」，和"今天真没学"一模一样。
  ///
  /// 约束：**只替换这一块**。上面的入口卡（题库/复习/错题/历史）与底部导航
  /// 不受影响，断网也照样能点。
  Widget _buildStatsSection(
    BuildContext context,
    WidgetRef ref,
    StatsState state,
  ) {
    if (state.isLoading && _hasNoStats(state.stats)) {
      return _buildStatsSkeleton(context);
    }
    if (state.error != null) {
      return DashboardStatsError(
        onRetry: () => ref.read(statsControllerProvider.notifier).load(),
      );
    }
    return Column(
      children: [
        DashboardProgressCard(stats: state.stats, dailyGoal: dailyGoal),
        SizedBox(height: 32.h),
        DashboardTodoList(stats: state.stats, dailyGoal: dailyGoal),
      ],
    );
  }

  /// 「还没有统计快照」：首次加载与失败时 `stats` 仍是 `LearningStats.empty`。
  /// 一旦拿到过数据就不再回退成骨架，刷新时不会整块闪一下。
  bool _hasNoStats(LearningStats stats) =>
      stats.totalSessions == 0 && stats.totalCount == 0;

  /// 加载态：用假数据驱动真实的进度卡与待办清单，再由 Skeletonizer 抹成骨块，
  /// 骨架版式与真实版式不会脱节（见 docs/mobile-ui-kit.md D-2）。
  Widget _buildStatsSkeleton(BuildContext context) {
    final fake = fakeStatsSummary();
    return Skeletonizer(
      enabled: true,
      child: Column(
        children: [
          DashboardProgressCard(stats: fake, dailyGoal: dailyGoal),
          SizedBox(height: 32.h),
          DashboardTodoList(stats: fake, dailyGoal: dailyGoal),
        ],
      ),
    );
  }
}
