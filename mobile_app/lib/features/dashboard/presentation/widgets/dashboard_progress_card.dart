import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/domain/learning_stats.dart';

/// 首页「今日进度」卡：连续天数、进度条、目标完成率与正确率。
///
/// 从 `dashboard_screen._buildProgressCard` 原样搬出（纯搬移，无行为改动）。
/// [dailyGoal] 由屏传入（`DashboardScreen.dailyGoal` 仍是唯一来源）。
class DashboardProgressCard extends StatelessWidget {
  const DashboardProgressCard({
    super.key,
    required this.stats,
    required this.dailyGoal,
  });

  final LearningStats stats;
  final int dailyGoal;

  @override
  Widget build(BuildContext context) {
    final todayCount = stats.todayCount;
    final todayAccuracy = stats.todayAccuracy;
    final streakDays = stats.streakDays;

    // 今日进度：每日目标见 [dailyGoal]（与待办清单同源）
    final progress = (todayCount / dailyGoal).clamp(0.0, 1.0);
    final progressText = todayCount > 0 ? '今日已练习 $todayCount 题' : '今日目标：尚未开始';
    // 进度条下方只放"目标 + 完成率"这类补充信息：同一句 progressText 在标题下
    // 已经报过练习量，再渲染一次会让右侧的数字失去上下文。
    final goalText = todayCount > 0
        ? '目标 $dailyGoal 题 · 已完成 ${(progress * 100).round()}%'
        : '目标 $dailyGoal 题';
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
            children: [
              // 左侧目标文案用 Expanded + 省略号：长机型/长文案都不会把右侧正确率挤出屏
              Expanded(
                child: Text(
                  goalText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: context.colors.textSecondary,
                  ),
                ),
              ),
              SizedBox(width: 8.w),
              Text(
                '正确率 $accuracyText',
                style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
