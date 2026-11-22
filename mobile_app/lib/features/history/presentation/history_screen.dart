import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'history_provider.dart';
import '../domain/history_item.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/practice_mode_labels.dart';

/// 历史记录列表页
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // 加载数据
    Future.microtask(() {
      ref.read(historyControllerProvider.notifier).loadHistory();
    });
    // 监听滚动加载更多
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(historyControllerProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(historyControllerProvider);

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '练习历史',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
          ),
        ),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(historyControllerProvider.notifier).refresh(),
        child: _buildBody(state),
      ),
    );
  }

  Widget _buildBody(HistoryListState state) {
    // 加载状态：显示骨架屏
    if (state.isLoading && state.items.isEmpty) {
      return _buildSkeleton();
    }

    if (state.error != null && state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              AppIcons.errorOutline,
              size: 48.sp,
              color: context.colors.error,
            ),
            SizedBox(height: 16.h),
            Text('加载失败', style: TextStyle(fontSize: 18.sp)),
            SizedBox(height: 8.h),
            ElevatedButton(
              onPressed: () =>
                  ref.read(historyControllerProvider.notifier).loadHistory(),
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    // 空状态：显示引导组件
    if (state.items.isEmpty) {
      return EmptyState(
        icon: '📚',
        title: '暂无练习记录',
        subtitle: '完成一次练习后会显示在这里',
        actionLabel: '开始练习',
        onAction: () => context.pushDetail(AppRoutes.practice),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
      itemCount: state.items.length + (state.hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == state.items.length) {
          return Padding(
            padding: EdgeInsets.symmetric(vertical: 16.h),
            child: const Center(child: CircularProgressIndicator()),
          );
        }
        return _buildHistoryCard(state.items[index]);
      },
    );
  }

  /// 加载骨架：用真实卡片撑出布局，由 Skeletonizer 统一涂成灰块
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: ListView.builder(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
        itemCount: 3,
        itemBuilder: (context, index) =>
            _buildHistoryCard(fakeHistoryItem(index: index)),
      ),
    );
  }

  Widget _buildHistoryCard(HistoryItem item) {
    final date = DateTime.tryParse(item.createdAt);
    final dateStr = date != null
        ? '${date.month}月${date.day}日 ${date.hour}:${date.minute.toString().padLeft(2, '0')}'
        : item.createdAt;

    return Hero(
      tag: 'history_item_${item.id}',
      child: Container(
        margin: EdgeInsets.only(bottom: 12.h),
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
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12.r),
            onTap: () {
              context.pushDetail(AppRoutes.historyDetail(item.id));
            },
            child: Padding(
              padding: EdgeInsets.all(16.w),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 标题行
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          _buildModeTag(item.practiceMode),
                          SizedBox(width: 8.w),
                          Text(
                            dateStr,
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: context.colors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      Icon(
                        AppIcons.chevronRight,
                        size: 20.sp,
                        color: context.colors.textSecondary,
                      ),
                    ],
                  ),
                  SizedBox(height: 12.h),
                  // 统计行
                  Row(
                    children: [
                      // 正确率
                      _buildStatBadge(
                        '${item.accuracy}%',
                        _getAccuracyColor(item.accuracy),
                      ),
                      SizedBox(width: 16.w),
                      // 正确/总数
                      Text(
                        '${item.correctCount}/${item.totalQuestions} 正确',
                        style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w500,
                          color: context.colors.text,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 8.h),
                  // 进度条
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4.r),
                    child: LinearProgressIndicator(
                      value: item.accuracy / 100,
                      backgroundColor: context.colors.surfaceAlt,
                      color: _getAccuracyColor(item.accuracy),
                      minHeight: 6.h,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeTag(String? mode) {
    final tag = _modeTag(context, mode);

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: tag.background,
        borderRadius: BorderRadius.circular(4.r),
      ),
      child: Text(
        tag.label,
        style: TextStyle(
          fontSize: 12.sp,
          fontWeight: FontWeight.w600,
          color: tag.foreground,
        ),
      ),
    );
  }

  /// 练习模式 → 标签文案 + 配色。
  ///
  /// 文案来自 [practiceModeTagOf]（与练习屏面包屑共用同一张表，避免两份漂移）；
  /// 这里只负责把语义色调映射成本屏用的主题色。
  ///
  /// 兜底是**中性**的「其它练习」：外部导入（`import`）、AI 题集（`agent_set`）、
  /// 试卷模考（`exam`）以前在历史里全被标成随机，用户会以为系统把自己的练习记错。
  /// 未知值宁可显示中性标签，也不要冒充某一种已知模式。
  ///
  /// 语义色只有四组，颜色只是辅助（同一组色会出现在两种模式上），区分靠文案。
  ({String label, Color foreground, Color background}) _modeTag(
    BuildContext context,
    String? mode,
  ) {
    final tag = practiceModeTagOf(mode);
    final colors = context.colors;
    final (Color foreground, Color background) = switch (tag.tone) {
      PracticeModeTone.accent => (colors.accent, colors.accentContainer),
      PracticeModeTone.danger => (colors.error, colors.errorContainer),
      PracticeModeTone.warning => (colors.warning, colors.warningContainer),
      PracticeModeTone.success => (colors.success, colors.successContainer),
      PracticeModeTone.neutral => (colors.textSecondary, colors.surfaceAlt),
    };
    return (label: tag.label, foreground: foreground, background: background);
  }

  Widget _buildStatBadge(String text, Color color) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 14.sp,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
    );
  }

  Color _getAccuracyColor(int accuracy) {
    if (accuracy >= 80) return context.colors.success;
    if (accuracy >= 60) return context.colors.warning;
    return context.colors.error;
  }
}
