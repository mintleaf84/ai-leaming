import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import '../../stats/presentation/stats_provider.dart';
import '../../stats/domain/learning_stats.dart';

class DashboardScreen extends HookConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 页面挂载时加载统计数据
    useEffect(() {
      Future.microtask(
        () => ref.read(statsControllerProvider.notifier).load(),
      );
      return null;
    }, const []);

    final statsState = ref.watch(statsControllerProvider);
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F5), // Notion-like background
      body: Stack(
        children: [
          SafeArea(
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
                        _buildHeader(),
                        SizedBox(height: 24.h),
                        // Divider
                        Divider(height: 1.h, color: Colors.grey[300]),
                        SizedBox(height: 24.h),
                        // Action Grid
                        _buildActionGrid(context),
                        SizedBox(height: 32.h),
                        // Progress Card
                        _buildProgressCard(statsState.stats),
                        SizedBox(height: 32.h),
                        // Todo List
                        _buildTodoList(),
                        SizedBox(height: 100.h), // Space for bottom nav
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Bottom Navigation
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _buildBottomNav(context),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
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
            color: const Color(0xFF37352F),
            fontFamily: 'Inter',
          ),
        ),
        SizedBox(height: 4.h),
        Text(
          dateStr,
          style: TextStyle(fontSize: 14.sp, color: const Color(0xFF9B9A97)),
        ),
      ],
    );
  }

  Widget _buildActionGrid(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: GestureDetector(
                onTap: () => context.go('/questions'),
                child: _buildActionCard(
                  icon: '📚',
                  tag: '查缺补漏',
                  tagColor: const Color(0xFFE8F3FF),
                  tagTextColor: const Color(0xFF135BEC),
                  title: '全量\n题库',
                  subtitleLabel: '探索',
                  subtitleValue: '获取所有题目',
                ),
              ),
            ),
            SizedBox(width: 16.w),
            Expanded(
              child: GestureDetector(
                onTap: () => context.go('/practice/setup'),
                child: _buildActionCard(
                  icon: '🧠',
                  tag: '待复习',
                  tagColor: const Color(0xFFFFF4E5),
                  tagTextColor: const Color(0xFFFF9500),
                  title: '智能\n复习',
                  subtitleLabel: '今日待办',
                  subtitleValue: '开始练习',
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 16.h),
        GestureDetector(
          onTap: () => context.go('/wrong-book'),
          child: _buildFullWidthCard(),
        ),
        SizedBox(height: 16.h),
        GestureDetector(
          onTap: () => context.go('/history'),
          child: _buildHistoryCard(),
        ),
      ],
    );
  }

  // Corrected Action Card with Stack
  Widget _buildActionCard({
    required String icon,
    required String tag,
    required Color tagColor,
    required Color tagTextColor,
    required String title,
    required String subtitleLabel,
    required String subtitleValue,
  }) {
    return Container(
      height: 176.h,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
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
                          fontSize: 10.sp,
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
                        color: const Color(0xFF37352F),
                        height: 1.2,
                      ),
                    ),
                  ],
                ),

                Column(
                  children: [
                    Divider(height: 1, color: Colors.grey[100]),
                    SizedBox(height: 12.h),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              subtitleLabel,
                              style: TextStyle(
                                fontSize: 10.sp,
                                color: Colors.grey,
                                letterSpacing: 0.5,
                              ),
                            ),
                            SizedBox(height: 2.h),
                            SizedBox(
                              width: 80.w,
                              child: Text(
                                subtitleValue,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        Icon(
                          Icons.arrow_forward,
                          size: 16.sp,
                          color: const Color(0xFF37352F),
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

  Widget _buildFullWidthCard() {
    return Container(
      height: 96.h,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
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
                child: Text('📕', style: TextStyle(fontSize: 60.sp)),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 6.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '重点关注',
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: const Color(0xFFDC2626),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(height: 4.h),
                    Text(
                      '我的错题',
                      style: TextStyle(
                        fontSize: 18.sp,
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF37352F),
                      ),
                    ),
                  ],
                ),
                Container(
                  decoration: BoxDecoration(
                    border: Border(left: BorderSide(color: Colors.grey[200]!)),
                  ),
                  padding: EdgeInsets.only(left: 16.w),
                  child: Row(
                    children: [
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '累计',
                            style: TextStyle(
                              fontSize: 10.sp,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            '--',
                            style: TextStyle(
                              fontSize: 14.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(width: 8.w),
                      Icon(
                        Icons.chevron_right,
                        size: 20.sp,
                        color: const Color(0xFF37352F),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard() {
    return Container(
      height: 96.h,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
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
                child: Text('⏳', style: TextStyle(fontSize: 60.sp)),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 6.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '温故知新',
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: const Color(0xFF4B5563),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(height: 4.h),
                    Text(
                      '练习历史',
                      style: TextStyle(
                        fontSize: 18.sp,
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF37352F),
                      ),
                    ),
                  ],
                ),
                Container(
                  decoration: BoxDecoration(
                    border: Border(left: BorderSide(color: Colors.grey[200]!)),
                  ),
                  padding: EdgeInsets.only(left: 16.w),
                  child: Row(
                    children: [
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '最近',
                            style: TextStyle(
                              fontSize: 10.sp,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            '回顾',
                            style: TextStyle(
                              fontSize: 14.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(width: 8.w),
                      Icon(
                        Icons.chevron_right,
                        size: 20.sp,
                        color: const Color(0xFF37352F),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressCard(LearningStats stats) {
    final todayCount = stats.todayCount;
    final todayAccuracy = stats.todayAccuracy;
    final streakDays = stats.streakDays;

    // 今日进度：假设每日目标 20 题
    const dailyGoal = 20;
    final progress = (todayCount / dailyGoal).clamp(0.0, 1.0);
    final progressText = todayCount > 0 ? '今日已练习 $todayCount 题' : '今日目标：尚未开始';
    final accuracyText = todayCount > 0
        ? '${(todayAccuracy * 100).toStringAsFixed(1)}%'
        : '0%';

    return Container(
      padding: EdgeInsets.all(20.w),
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
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40.w,
                height: 40.h,
                decoration: BoxDecoration(
                  color: const Color(0xFF37352F).withValues(alpha: 0.08),
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
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey),
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
              backgroundColor: const Color(0xFFF0F0F0),
              color: const Color(0xFF37352F),
              minHeight: 10.h,
            ),
          ),
          SizedBox(height: 12.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                progressText,
                style: TextStyle(fontSize: 12.sp, color: Colors.grey),
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

  Widget _buildTodoList() {
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
                color: Colors.grey,
              ),
            ),
          ],
        ),
        SizedBox(height: 12.h),
        Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: const Color(0xFFE8E8E5)),
          ),
          child: Row(
            children: [
              Icon(
                Icons.check_circle_outline,
                size: 20.sp,
                color: Colors.grey[400],
              ),
              SizedBox(width: 12.w),
              Text(
                '完成今日练习后自动生成待办项',
                style: TextStyle(fontSize: 14.sp, color: Colors.grey[400]),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: 12.h,
        bottom: 24.h,
        left: 24.w,
        right: 24.w,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[200]!)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            offset: const Offset(0, -4),
            blurRadius: 6,
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildNavItem(Icons.dashboard, '工作区', true, null),
          _buildNavItem(
            Icons.smart_toy,
            'AI助手',
            false,
            () => context.go('/chat'),
          ),
          _buildNavItem(
            Icons.book,
            '知识库',
            false,
            () => context.go('/knowledge'),
          ),
          _buildNavItem(
            Icons.library_books,
            '教材',
            false,
            () => context.go('/textbooks'),
          ),
          _buildNavItem(
            Icons.person_outline,
            '我的',
            false,
            () => context.go('/profile'),
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    IconData icon,
    String label,
    bool isSelected,
    VoidCallback? onTap,
  ) {
    final activeColor = const Color(0xFF37352F);
    final inactiveColor = const Color(0xFF9B9A97);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 4.h),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedScale(
              scale: isSelected ? 1.1 : 1.0,
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutBack,
              child: Icon(
                icon,
                size: 24.sp,
                color: isSelected ? activeColor : inactiveColor,
              ),
            ),
            SizedBox(height: 4.h),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 10.sp,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? activeColor : inactiveColor,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }
}
