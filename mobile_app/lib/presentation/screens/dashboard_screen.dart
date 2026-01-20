import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';

class DashboardScreen extends HookConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                        _buildProgressCard(),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('📖', style: TextStyle(fontSize: 48.sp)),
        SizedBox(height: 8.h),
        Text(
          '我的学习\n空间',
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
          '10月24日 星期一', // Dynamic date can be added later
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
                onTap: () => context.go('/practice'),
                child: _buildActionCard(
                  icon: '✏️',
                  tag: '进行中',
                  tagColor: const Color(0xFFE8F3FF),
                  tagTextColor: const Color(0xFF135BEC),
                  title: '继续\n练习',
                  subtitleLabel: '下一项',
                  subtitleValue: '数学专项训练',
                ),
              ),
            ),
            SizedBox(width: 16.w),
            Expanded(
              child: GestureDetector(
                onTap: () => context.go('/practice'),
                child: _buildActionCard(
                  icon: '🧠',
                  tag: '待复习',
                  tagColor: const Color(0xFFFFF4E5),
                  tagTextColor: const Color(0xFFFF9500),
                  title: '智能\n复习',
                  subtitleLabel: '今日待办',
                  subtitleValue: '12 个知识点',
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 16.h),
        GestureDetector(
          onTap: () => context.go('/practice'),
          child: _buildFullWidthCard(),
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
                            '24 题',
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

  Widget _buildProgressCard() {
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
                    '保持状态！',
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '已连续学习 5 天',
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
              value: 0.48,
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
                '今日目标：已完成 24/50',
                style: TextStyle(fontSize: 12.sp, color: Colors.grey),
              ),
              Text(
                '48%',
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
            Icon(Icons.add, size: 20.sp, color: Colors.grey),
          ],
        ),
        SizedBox(height: 12.h),
        _buildTodoItem('复习生物第四章', false),
        SizedBox(height: 8.h),
        _buildTodoItem('完成 20 道微积分题', false),
        SizedBox(height: 8.h),
        _buildTodoItem('晨间单词回顾', true),
      ],
    );
  }

  Widget _buildTodoItem(String text, bool completed) {
    return Container(
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: Colors.transparent), // Simplified for now
      ),
      child: Row(
        children: [
          Icon(
            completed ? Icons.check_box : Icons.check_box_outline_blank,
            size: 20.sp,
            color: const Color(0xFF37352F),
          ),
          SizedBox(width: 12.w),
          Text(
            text,
            style: TextStyle(
              fontSize: 16.sp,
              color: completed ? Colors.grey : const Color(0xFF37352F),
              decoration: completed ? TextDecoration.lineThrough : null,
            ),
          ),
        ],
      ),
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
            Icons.history,
            '历史',
            false,
            () => context.go('/history'),
          ),
          _buildNavItem(
            Icons.book,
            '知识库',
            false,
            () => context.go('/knowledge'),
          ),
          _buildNavItem(
            Icons.bar_chart,
            '掌握度',
            false,
            () => context.go('/mastery'),
          ),
          _buildNavItem(Icons.settings, '设置', false, null),
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
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 24.sp,
            color: isSelected ? const Color(0xFF37352F) : Colors.grey,
          ),
          SizedBox(height: 4.h),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              color: isSelected ? const Color(0xFF37352F) : Colors.grey,
            ),
          ),
        ],
      ),
    );
  }
}
