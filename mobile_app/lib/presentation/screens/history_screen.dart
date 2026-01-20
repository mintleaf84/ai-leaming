import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import '../providers/history_provider.dart';
import '../../domain/entities/history_item.dart';
import '../widgets/skeleton_loading.dart';
import '../widgets/empty_state.dart';

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
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
          onPressed: () => context.go('/dashboard'),
        ),
        title: Text(
          '练习历史',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
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
      return const HistorySkeletonList();
    }

    if (state.error != null && state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48.sp, color: Colors.red),
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
        onAction: () => context.go('/practice'),
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

  Widget _buildHistoryCard(HistoryItem item) {
    final date = DateTime.tryParse(item.createdAt);
    final dateStr = date != null
        ? '${date.month}月${date.day}日 ${date.hour}:${date.minute.toString().padLeft(2, '0')}'
        : item.createdAt;

    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
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
            context.go('/history/${item.id}');
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
                        _buildModeTag(item.practiceMode ?? 'random'),
                        SizedBox(width: 8.w),
                        Text(
                          dateStr,
                          style: TextStyle(fontSize: 12.sp, color: Colors.grey),
                        ),
                      ],
                    ),
                    Icon(Icons.chevron_right, size: 20.sp, color: Colors.grey),
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
                        color: const Color(0xFF37352F),
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
                    backgroundColor: const Color(0xFFF0F0F0),
                    color: _getAccuracyColor(item.accuracy),
                    minHeight: 6.h,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeTag(String mode) {
    final modeMap = {
      'random': ('随机练习', const Color(0xFF135BEC), const Color(0xFFE8F3FF)),
      'wrong': ('错题复习', const Color(0xFFDC2626), const Color(0xFFFEF2F2)),
      'tag': ('专项练习', const Color(0xFFFF9500), const Color(0xFFFFF4E5)),
    };
    final config = modeMap[mode] ?? modeMap['random']!;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: config.$3,
        borderRadius: BorderRadius.circular(4.r),
      ),
      child: Text(
        config.$1,
        style: TextStyle(
          fontSize: 10.sp,
          fontWeight: FontWeight.w600,
          color: config.$2,
        ),
      ),
    );
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
    if (accuracy >= 80) return const Color(0xFF4EA05E);
    if (accuracy >= 60) return const Color(0xFFFF9500);
    return const Color(0xFFD95656);
  }
}
