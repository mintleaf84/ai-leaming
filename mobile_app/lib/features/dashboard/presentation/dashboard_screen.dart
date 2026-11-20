import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../../core/compat/contract_meta_repository.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/network/connectivity_provider.dart';
import '../../history/presentation/history_provider.dart';
import '../../practice/domain/practice_resume.dart';
import '../../practice/presentation/practice_resume_provider.dart';
import '../../recall/data/recall_providers.dart';
import '../../recall/domain/recall_queue.dart';
import '../../stats/presentation/stats_provider.dart';
import '../../stats/domain/learning_stats.dart';
import '../../wrong_book/data/wrong_book_repository.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/contract_gate.dart';

/// 首页：备考主路径的起点。
///
/// 三张功能卡右侧的数值**必须**来自真实数据（审计 §25 F1/F4）：
/// 写死「--」「几分钟」「回顾」会让用户以为数据没加载或坏了。取不到数据时
/// 显示「暂无」，而不是编一个看起来合理的数字。
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
                    _buildHeader(context),
                    SizedBox(height: 24.h),
                    // Divider
                    Divider(height: 1.h, color: context.colors.border),
                    SizedBox(height: 24.h),
                    // 未完成练习：入口放在功能卡之前——它比任何一张卡都更接近
                    // 「今天还剩几题」这件事。
                    if (resume != null) ...[
                      _buildResumeCard(context, resume),
                      SizedBox(height: 16.h),
                    ],
                    // Action Grid
                    _buildActionGrid(
                      context,
                      showRecall: showRecall,
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

  /// 记忆卡右侧数值：今日到期张数。
  ///
  /// 到期 0 时给「今天已完成」而不是「0 张」——后者读起来像「今天还没开始」。
  /// 队列还没回来/失败时给「暂无」：宁可承认不知道，也不写一个假数字。
  String _recallValue(AsyncValue<RecallQueue>? queue, {required bool isOnline}) {
    if (!isOnline) return '联网后可用';
    final value = queue?.value;
    if (value == null) return '暂无';
    if (value.due > 0) return '${value.due} 张';
    return '今天已完成';
  }

  /// 错题卡右侧数值：累计条数。
  String _wrongValue(AsyncValue<int> total) {
    final value = total.value;
    if (value == null || value <= 0) return '暂无';
    return '$value 条';
  }

  /// 练习历史卡右侧数值：最近一次练习时间。
  String _lastPracticeValue(DateTime? at) {
    if (at == null) return '暂无';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(at.year, at.month, at.day);
    final days = today.difference(day).inDays;
    final hm =
        '${at.hour.toString().padLeft(2, '0')}:'
        '${at.minute.toString().padLeft(2, '0')}';
    if (days <= 0) return '今天 $hm';
    if (days == 1) return '昨天 $hm';
    if (days < 7) return '$days 天前';
    return '${at.month}月${at.day}日';
  }

  /// 「继续上次练习」：回到那一场的断点题。
  ///
  /// 不经过配置页：断点里已经有会话与进度，再让用户选模式/题量是多余的一步。
  /// 已答记录（题号 + 对错）一并带过去：练习页据此回填结果、定位第一道未答题。
  Widget _buildResumeCard(BuildContext context, PracticeResume resume) {
    final total = resume.total;
    final position = resume.startIndex + 1;
    return _buildWideCard(
      context,
      icon: '▶️',
      tag: '未完成',
      tagColor: context.colors.warningContainer,
      tagTextColor: context.colors.warning,
      title: '继续上次练习',
      trailingLabel: '进度',
      trailingValue: '$position/$total 题',
      onTap: () => context.pushDetail(
        AppRoutes.practice,
        extra: <String, dynamic>{
          'sessionId': resume.sessionId,
          'startIndex': resume.startIndex,
          'answered': resume.answers,
          'mode': resume.mode,
        },
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final now = DateTime.now();
    final hour = now.hour;
    String greeting = '我的学习\n空间';
    String emoji = '📖';
    if (hour < 5) {
      greeting = '夜深了,\n还在学习吗?';
      emoji = '🦉';
    } else if (hour < 12) {
      greeting = '早上好,\n开始学习吧!';
      emoji = '🌅';
    } else if (hour < 18) {
      greeting = '下午好,\n继续保持!';
      emoji = '☀️';
    } else {
      greeting = '晚上好,\n总结今日所学';
      emoji = '🌙';
    }

    final weekDays = ['一', '二', '三', '四', '五', '六', '日'];
    final dateStr = '${now.month}月${now.day}日 星期${weekDays[now.weekday - 1]}';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: _buildGreeting(context, emoji, greeting, dateStr)),
        // 「我的」原来是底部导航的一格；导航换成四个高频入口后，
        // 个人中心改由头像入口进入（不占常驻位置，但仍然一步可达）。
        IconButton(
          tooltip: '我的',
          onPressed: () => context.pushDetail(AppRoutes.profile),
          icon: Icon(
            AppIcons.personOutline,
            color: context.colors.text,
            size: 24.sp,
          ),
        ),
      ],
    );
  }

  Widget _buildGreeting(
    BuildContext context,
    String emoji,
    String greeting,
    String dateStr,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(emoji, style: TextStyle(fontSize: 48.sp)),
        SizedBox(height: 8.h),
        Text(
          greeting,
          style: TextStyle(
            fontSize: 36.sp,
            fontWeight: FontWeight.bold,
            height: 1.1,
            color: context.colors.text,
            fontFamily: 'Inter',
          ),
        ),
        SizedBox(height: 4.h),
        Text(
          dateStr,
          style: TextStyle(
            fontSize: 14.sp,
            color: context.colors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildActionGrid(
    BuildContext context, {
    required bool showRecall,
    required bool isOnline,
    required AsyncValue<RecallQueue>? recallQueue,
    required AsyncValue<int> wrongTotal,
    required DateTime? lastPracticeAt,
  }) {
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => context.pushDetail(AppRoutes.questions),
                  child: _buildActionCard(
                    context,
                    icon: '📚',
                    tag: '查缺补漏',
                    tagColor: context.colors.accentContainer,
                    tagTextColor: context.colors.accent,
                    title: '全量\n题库',
                    subtitleLabel: '探索',
                    subtitleValue: '获取所有题目',
                  ),
                ),
              ),
              SizedBox(width: 16.w),
              Expanded(
                child: GestureDetector(
                  onTap: () => context.pushDetail(AppRoutes.practiceSetup),
                  child: _buildActionCard(
                    context,
                    icon: '🧠',
                    tag: '待复习',
                    tagColor: context.colors.warningContainer,
                    tagTextColor: context.colors.warning,
                    title: '智能\n复习',
                    subtitleLabel: '今日待办',
                    subtitleValue: '开始练习',
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 16.h),
        // 整宽行：按"每天要做 → 补漏 → 回看"的优先级往下排。
        // 记忆卡放在第一行整宽位而不是挤进两列：两列里落单一张会留半个空槽，
        // 而它本身就是"开始一件事"的入口，用整宽行更接近顶部两张卡的语义。
        //
        // 服务端自述没有 recall 能力时整张卡不出现（连它的间距一起）：
        // 留一个空槽位比隐藏更难看，而灰显一张点不动的卡是欺骗。
        //
        // 离线是例外（审计 #20 方案 A）：这张卡进去就要拉会话，断网只会在下一页
        // 撞一个空屏。所以断网时保留卡片但**禁用**，并把原因写在卡上——用户看到
        // 的是「离线 / 联网后可用」，而不是一张点了没反应的卡。
        if (showRecall) ...[
          _buildWideCard(
            context,
            icon: '📇',
            tag: '每日记一点',
            tagColor: context.colors.successContainer,
            tagTextColor: context.colors.success,
            title: '记忆卡',
            trailingLabel: isOnline ? '今日到期' : '离线',
            trailingValue: _recallValue(recallQueue, isOnline: isOnline),
            onTap: isOnline ? () => context.pushDetail(AppRoutes.recall) : null,
            disabledNote: isOnline ? null : '离线，联网后可进入记忆卡',
          ),
          SizedBox(height: 16.h),
        ],
        _buildWideCard(
          context,
          icon: '📕',
          tag: '重点关注',
          tagColor: context.colors.errorContainer,
          tagTextColor: context.colors.error,
          title: '我的错题',
          trailingLabel: '累计',
          trailingValue: _wrongValue(wrongTotal),
          onTap: () => context.pushDetail(AppRoutes.wrongBook),
        ),
        SizedBox(height: 16.h),
        _buildWideCard(
          context,
          icon: '⏳',
          tag: '温故知新',
          tagColor: context.colors.surfaceAlt,
          tagTextColor: const Color(0xFF4B5563),
          title: '练习历史',
          trailingLabel: '最近',
          trailingValue: _lastPracticeValue(lastPracticeAt),
          onTap: () => context.pushDetail(AppRoutes.history),
        ),
      ],
    );
  }

  // Corrected Action Card with Stack
  Widget _buildActionCard(
    BuildContext context, {
    required String icon,
    required String tag,
    required Color tagColor,
    required Color tagTextColor,
    required String title,
    required String subtitleLabel,
    required String subtitleValue,
  }) {
    // 固定高度改最小高度：字号放大到 1.3 倍时内容比 176 高，定高会溢出 11px；
    // 用 minHeight 让卡片自己长高（标准字号下渲染完全一致），
    // 同排两张由外层 IntrinsicHeight + stretch 保持等高。
    return Container(
      constraints: BoxConstraints(minHeight: 176.h),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: context.colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: 0,
            top: 0,
            child: Padding(
              padding: EdgeInsets.all(16.w),
              child: Opacity(
                opacity: 0.1, // Faded
                child: Text(icon, style: TextStyle(fontSize: 60.sp)),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 6.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: tagColor,
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        tag,
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: tagTextColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(height: 12.h),
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 18.sp,
                        fontWeight: FontWeight.bold,
                        color: context.colors.text,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),

                Column(
                  children: [
                    Divider(height: 1, color: context.colors.border),
                    SizedBox(height: 12.h),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // 原来给副标题写死 80.w，字号放大后「获取所有题目」会被截成
                        // 「获取所有题…」。改成 Flexible：宽度跟着剩余空间走，
                        // 只有真的放不下才省略，箭头永远留在右边。
                        Flexible(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                subtitleLabel,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: context.colors.textSecondary,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              SizedBox(height: 2.h),
                              Text(
                                subtitleValue,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: 4.w),
                        Icon(
                          AppIcons.arrowForward,
                          size: 16.sp,
                          color: context.colors.text,
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 整宽入口卡（错题本 / 练习历史 / 记忆卡共用一种形态）。
  ///
  /// 原本是两份逐字重复的实现（只有 emoji、标签、标题、右侧两行字不同），
  /// 加第三个入口时合并成一个：三张卡的圆角、阴影、emoji 水印位置、分割线
  /// 从此不可能各写一套。
  ///
  /// 右侧那两行（如「累计 / 24 条」「今日到期 / 3 张」）是**真实数据**：
  /// 数据没到或取失败时显示「暂无」，绝不写死一个看起来合理的数字
  /// （审计 §25 F1/F4：写死「--」「几分钟」会让用户以为数据坏了）。
  ///
  /// `onTap` 为 null 表示入口**禁用**（当前只有离线时的记忆卡）：此时卡片降透明度、
  /// 不再响应点击，并在标签下方写出 [disabledNote] 说明原因。禁用而不是隐藏，
  /// 是因为用户需要知道「有这个功能，只是现在用不了」。
  Widget _buildWideCard(
    BuildContext context, {
    required String icon,
    required String tag,
    required Color tagColor,
    required Color tagTextColor,
    required String title,
    required String trailingLabel,
    required String trailingValue,
    required VoidCallback? onTap,
    String? disabledNote,
  }) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: enabled ? title : '$title，$disabledNote',
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.55,
          child: Container(
            // 同两列卡：最小高度而不是固定高度，1.3 倍字号时不溢出
            constraints: BoxConstraints(minHeight: 96.h),
            decoration: BoxDecoration(
              color: context.colors.surface,
              borderRadius: BorderRadius.circular(16.r),
              border: Border.all(color: context.colors.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Stack(
              children: [
                Positioned(
                  right: 40.w,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: Opacity(
                      opacity: 0.1,
                      child: Text(icon, style: TextStyle(fontSize: 60.sp)),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(16.w),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // 标签 + 标题：字号放大时允许两行，不裁字
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: 6.w,
                                vertical: 2.h,
                              ),
                              decoration: BoxDecoration(
                                color: tagColor,
                                borderRadius: BorderRadius.circular(4.r),
                              ),
                              child: Text(
                                tag,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: tagTextColor,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            SizedBox(height: 4.h),
                            Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 18.sp,
                                fontWeight: FontWeight.bold,
                                color: context.colors.text,
                              ),
                            ),
                            if (disabledNote != null) ...[
                              SizedBox(height: 2.h),
                              Text(
                                disabledNote,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.sp,
                                  color: context.colors.textSecondary,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Container(
                        decoration: BoxDecoration(
                          border: Border(
                            left: BorderSide(color: context.colors.border),
                          ),
                        ),
                        padding: EdgeInsets.only(left: 16.w),
                        child: Row(
                          children: [
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  trailingLabel,
                                  style: TextStyle(
                                    fontSize: 12.sp,
                                    color: context.colors.textSecondary,
                                  ),
                                ),
                                Text(
                                  trailingValue,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14.sp,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(width: 8.w),
                            Icon(
                              AppIcons.chevronRight,
                              size: 20.sp,
                              color: context.colors.text,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
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
      return _buildStatsError(context, ref);
    }
    return Column(
      children: [
        _buildProgressCard(context, state.stats),
        SizedBox(height: 32.h),
        _buildTodoList(context, state.stats),
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
          _buildProgressCard(context, fake),
          SizedBox(height: 32.h),
          _buildTodoList(context, fake),
        ],
      ),
    );
  }

  /// 失败态：一行说明 + 重试，就地替换统计区，不接管整页。
  Widget _buildStatsError(BuildContext context, WidgetRef ref) {
    return Semantics(
      container: true,
      label: '统计数据加载失败，可重试',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
        decoration: BoxDecoration(
          color: context.colors.errorContainer,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: context.colors.error.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Icon(
              AppIcons.errorOutline,
              size: 18.sp,
              color: context.colors.error,
            ),
            SizedBox(width: 8.w),
            Expanded(
              child: Text(
                '统计没加载出来',
                style: TextStyle(fontSize: 13.sp, color: context.colors.error),
              ),
            ),
            SizedBox(width: 8.w),
            // 触控区 ≥44×44：TextButton 默认高度约 36
            ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
              child: TextButton(
                onPressed: () =>
                    ref.read(statsControllerProvider.notifier).load(),
                style: TextButton.styleFrom(
                  foregroundColor: context.colors.error,
                ),
                child: const Text('重试'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressCard(BuildContext context, LearningStats stats) {
    final todayCount = stats.todayCount;
    final todayAccuracy = stats.todayAccuracy;
    final streakDays = stats.streakDays;

    // 今日进度：每日目标见 [dailyGoal]（与待办清单同源）
    final progress = (todayCount / dailyGoal).clamp(0.0, 1.0);
    final progressText = todayCount > 0 ? '今日已练习 $todayCount 题' : '今日目标：尚未开始';
    final accuracyText = todayCount > 0
        ? '${(todayAccuracy * 100).toStringAsFixed(1)}%'
        : '0%';

    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: context.colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40.w,
                height: 40.h,
                decoration: BoxDecoration(
                  color: context.colors.text.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text('🔥', style: TextStyle(fontSize: 20.sp)),
              ),
              SizedBox(width: 12.w),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    streakDays > 0 ? '连续学习 $streakDays 天！' : '开始今日学习！',
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    progressText,
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: context.colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
          SizedBox(height: 16.h),
          ClipRRect(
            borderRadius: BorderRadius.circular(5.r),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: context.colors.surfaceAlt,
              color: context.colors.text,
              minHeight: 10.h,
            ),
          ),
          SizedBox(height: 12.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                progressText,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: context.colors.textSecondary,
                ),
              ),
              Text(
                accuracyText,
                style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 待办清单：条目全部由 [LearningStats] 的真实字段推导，没有占位文案。
  ///
  /// 「今日还需练习 N 题」这一条可以直接开练（F3）：待办已经知道还差几题，
  /// 再让用户去配置页选模式/题量是多余的一步。其余两条只做提示，不可点。
  Widget _buildTodoList(BuildContext context, LearningStats stats) {
    final entries = _buildTodoEntries(stats);
    final remaining = dailyGoal - stats.todayCount;
    // 目标已完成（remaining ≤ 0）时仍允许继续练：给练习页一个正常题量，
    // 而不是把 0 传下去变成一场空练习。
    final limit = remaining > 0 ? remaining : 10;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '待办清单',
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ),
        SizedBox(height: 12.h),
        Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: context.colors.surface,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: context.colors.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < entries.length; i++) ...[
                if (i > 0) Divider(height: 20.h, color: context.colors.border),
                _buildTodoRow(
                  context,
                  entries[i],
                  // 只有「今日还需练习」这一条能一键开练；模式用练习页的默认
                  // （后端目前只支持 random，settings 里的 reviewMode 是
                  // 清单/沉浸的展示口径，传过去会 400）。
                  onTap: i == 0
                      ? () => context.pushDetail(
                          AppRoutes.practice,
                          extra: <String, dynamic>{
                            'limit': limit,
                            'mode': 'random',
                          },
                        )
                      : null,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  List<_TodoEntry> _buildTodoEntries(LearningStats stats) {
    final remaining = dailyGoal - stats.todayCount;
    final wrongCount = stats.todayCount - stats.todayCorrect;
    final todayPracticed = stats.todayCount > 0;
    final accuracy = (stats.todayAccuracy * 100).toStringAsFixed(1);

    final practiceTitle = remaining > 0
        ? '今日还需练习 $remaining 题'
        : '今日 $dailyGoal 题目标已完成';
    final practiceSubtitle = todayPracticed
        ? '已练 ${stats.todayCount} 题 · 正确率 $accuracy%'
        : '今日还没有练习记录';
    final wrongTitle = wrongCount > 0 ? '复盘今日 $wrongCount 道错题' : '今日暂无错题需要复盘';
    final wrongSubtitle = wrongCount > 0 ? '在错题本中重做一遍' : '答错的题目会自动进入错题本';
    final streakTitle = stats.streakDays > 0
        ? '连续学习 ${stats.streakDays} 天'
        : '开启连续学习记录';
    final streakSubtitle =
        '累计 ${stats.totalSessions} 场练习 · ${stats.totalCount} 题';

    return <_TodoEntry>[
      _TodoEntry(
        icon: AppIcons.playCircleOutline,
        title: practiceTitle,
        subtitle: practiceSubtitle,
        isDone: remaining <= 0,
      ),
      _TodoEntry(
        icon: AppIcons.errorOutline,
        title: wrongTitle,
        subtitle: wrongSubtitle,
        isDone: wrongCount <= 0,
      ),
      _TodoEntry(
        icon: AppIcons.localFireDepartmentOutlined,
        title: streakTitle,
        subtitle: streakSubtitle,
        isDone: todayPracticed && stats.streakDays > 0,
      ),
    ];
  }

  Widget _buildTodoRow(
    BuildContext context,
    _TodoEntry entry, {
    VoidCallback? onTap,
  }) {
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          entry.isDone ? AppIcons.checkCircle : entry.icon,
          size: 20.sp,
          color: entry.isDone
              ? context.colors.success
              : context.colors.textSecondary,
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry.title,
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w600,
                  color: entry.isDone
                      ? context.colors.textSecondary
                      : context.colors.text,
                  decoration: entry.isDone
                      ? TextDecoration.lineThrough
                      : TextDecoration.none,
                ),
              ),
              SizedBox(height: 2.h),
              Text(
                entry.subtitle,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        if (onTap != null)
          Icon(
            AppIcons.chevronRight,
            size: 18.sp,
            color: context.colors.textSecondary,
          ),
      ],
    );

    if (onTap == null) return row;
    // 语义写在容器上：InkWell 的可点子项是变量，读屏拿不到可见文字。
    return Semantics(
      button: true,
      label: entry.title,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.r),
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 4.h),
          child: row,
        ),
      ),
    );
  }
}

/// 待办清单条目：字段全部由 LearningStats 推导，不引入额外数据源。
class _TodoEntry {
  const _TodoEntry({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isDone,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool isDone;
}
