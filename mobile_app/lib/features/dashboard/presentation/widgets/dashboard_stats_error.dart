import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 统计区失败态：一行说明 + 重试，就地替换统计区，不接管整页。
///
/// 从 `dashboard_screen._buildStatsError` 原样搬出（纯搬移，无行为改动）。
/// 重试动作由屏传入（屏持有 `ref`），这里不直接碰 provider。
class DashboardStatsError extends StatelessWidget {
  const DashboardStatsError({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
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
                onPressed: onRetry,
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
}
