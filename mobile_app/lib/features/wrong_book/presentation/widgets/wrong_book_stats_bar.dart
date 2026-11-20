import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/wrong_question.dart';

/// 错题本顶部统计条（总错题 / 近7天 / 高频错题）。
///
/// 从 `wrong_book_screen.dart` 原样搬出：数据由调用方传入，颜色仍取自主题。
class WrongBookStatsBar extends StatelessWidget {
  const WrongBookStatsBar({super.key, required this.stats});

  final WrongBookStats stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(16.w),
      child: Row(
        children: [
          _StatCard(
            label: '总错题',
            value: stats.total,
            color: context.colors.error,
          ),
          SizedBox(width: 12.w),
          _StatCard(
            label: '近7天',
            value: stats.recent,
            color: context.colors.warning,
          ),
          SizedBox(width: 12.w),
          _StatCard(
            label: '高频错题',
            value: stats.frequent,
            color: context.colors.accent,
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 12.h, horizontal: 12.w),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: context.colors.border),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(
                fontSize: 24.sp,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.sp,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
