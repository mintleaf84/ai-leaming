import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';

/// 作答进度条：第 N / 共 M 题 + 已答数。
class ExamSessionProgress extends StatelessWidget {
  const ExamSessionProgress({
    super.key,
    required this.colors,
    required this.index,
    required this.total,
    required this.answeredCount,
  });

  /// 当前题序号（从 0 开始）。
  final int index;
  final int total;
  final int answeredCount;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20.w, 4.h, 20.w, 8.h),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '第 ${index + 1} / $total 题',
                  style: TextStyle(
                    fontSize: 12.sp,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                    fontFeatures: const <FontFeature>[
                      FontFeature.tabularFigures(),
                    ],
                  ),
                ),
              ),
              Text(
                '已答 $answeredCount',
                style: TextStyle(
                  fontSize: 11.sp,
                  color: colors.textSecondary,
                  fontFeatures: const <FontFeature>[
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 6.h),
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : (index + 1) / total,
              minHeight: 4.h,
              backgroundColor: colors.surfaceAlt,
              valueColor: AlwaysStoppedAnimation<Color>(colors.accent),
            ),
          ),
        ],
      ),
    );
  }
}
