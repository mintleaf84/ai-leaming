import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../exam_format.dart';

/// 倒计时徽标：最后一分钟变红。
class ExamTimerBadge extends StatelessWidget {
  const ExamTimerBadge({
    super.key,
    required this.remaining,
    required this.colors,
  });

  final Duration remaining;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    final urgent = remaining.inSeconds <= 60;
    final foreground = urgent ? colors.error : colors.textSecondary;
    return Semantics(
      label: '剩余时间 ${formatExamRemaining(remaining) ?? '--'}',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
        decoration: BoxDecoration(
          color: urgent ? colors.errorContainer : colors.surfaceAlt,
          borderRadius: BorderRadius.circular(6.r),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(AppIcons.accessTime, size: 13.sp, color: foreground),
            SizedBox(width: 4.w),
            Text(
              formatExamRemaining(remaining) ?? '--:--',
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w700,
                color: foreground,
                fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
