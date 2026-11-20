import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_icons.dart';
import '../../../domain/exam_submit_result.dart';
import '../../exam_format.dart';

/// 超时 / 重复提交标记。
class ExamResultFlags extends StatelessWidget {
  const ExamResultFlags({
    super.key,
    required this.result,
    required this.colors,
  });

  final ExamSubmitResult result;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8.w,
      runSpacing: 8.h,
      children: [
        if (result.overtime)
          _Flag(
            icon: AppIcons.accessTime,
            text: formatExamOvertime(result.overtimeMs),
            background: colors.warningContainer,
            foreground: colors.warning,
          ),
        if (result.duplicate)
          _Flag(
            icon: AppIcons.infoOutline,
            text: '重复提交，未重复计分',
            background: colors.surfaceAlt,
            foreground: colors.textSecondary,
          ),
      ],
    );
  }
}

class _Flag extends StatelessWidget {
  const _Flag({
    required this.icon,
    required this.text,
    required this.background,
    required this.foreground,
  });

  final IconData icon;
  final String text;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 5.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6.r),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13.sp, color: foreground),
          SizedBox(width: 5.w),
          Text(
            text,
            style: TextStyle(
              fontSize: 11.sp,
              fontWeight: FontWeight.w600,
              color: foreground,
            ),
          ),
        ],
      ),
    );
  }
}
