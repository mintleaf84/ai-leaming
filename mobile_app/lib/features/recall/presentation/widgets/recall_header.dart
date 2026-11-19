import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'recall_tones.dart';

/// 作答流顶部的一行合计 + 连续天数 + 进度。
///
/// 规格要求页面上不出现评分、正确率、等级、徽章，所以这里只有「还剩多少」和
/// 「已经连续几天」这一类事实。进度用一条细线而不是一排圆点：卡量到几十张时
/// 圆点会挤成一团，且字号放大后必然溢出。
class RecallHeader extends StatelessWidget {
  const RecallHeader({
    super.key,
    required this.total,
    required this.doneCount,
    required this.estimatedMinutes,
    required this.streakDays,
    this.lastNote,
  });

  final int total;
  final int doneCount;
  final int estimatedMinutes;
  final int streakDays;

  /// 上一张卡的结论（「下次 11 月 20 日」），只在作答屏回显。
  final String? lastNote;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final secondary = scheme.onSurface.withValues(alpha: 0.6);
    final finished = total == 0 ? 0.0 : doneCount / total;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                '回忆 $total 张 · 约 $estimatedMinutes 分钟',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 12.sp,
                  color: secondary,
                  fontFeatures: recallTabularFigures,
                ),
              ),
            ),
            if (streakDays > 0)
              Padding(
                padding: EdgeInsets.only(left: 12.w),
                child: Text(
                  '连续 $streakDays 天',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12.sp,
                    color: secondary,
                    fontFeatures: recallTabularFigures,
                  ),
                ),
              ),
          ],
        ),
        SizedBox(height: 10.h),
        ClipRRect(
          borderRadius: BorderRadius.circular(4.r),
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: finished.clamp(0, 1)),
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            builder: (context, value, child) => LinearProgressIndicator(
              value: value,
              minHeight: 4.h,
              backgroundColor: scheme.onSurface.withValues(alpha: 0.07),
              valueColor: AlwaysStoppedAnimation<Color>(scheme.secondary),
            ),
          ),
        ),
        if (lastNote != null && lastNote!.isNotEmpty) ...[
          SizedBox(height: 8.h),
          Text(
            '上一张：$lastNote',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12.sp,
              color: secondary,
            ),
          ),
        ],
      ],
    );
  }
}
