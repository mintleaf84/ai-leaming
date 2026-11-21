import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';

/// 练习页顶部的进度：`第 x/y 题` + 剩余题数 + 进度条。
///
/// 进度按「已答 / 本轮题数」走（见 `AgentSetPracticeState.progress`）：
/// 中途报错移出一题时，数量会变，但不会出现「进度条突然前进一格」。
class AgentSetProgressHeader extends StatelessWidget {
  const AgentSetProgressHeader({
    super.key,
    required this.position,
    required this.total,
    required this.remaining,
    required this.progress,
    required this.correctCount,
    required this.answeredCount,
  });

  final int position;
  final int total;
  final int remaining;
  final double progress;
  final int correctCount;
  final int answeredCount;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(20.w, 8.h, 20.w, 10.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '第 $position/$total 题',
                style: TextStyle(
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w700,
                  color: colors.text,
                ),
              ),
              const Spacer(),
              Text(
                answeredCount > 0
                    ? '答对 $correctCount/$answeredCount · 剩 $remaining 题'
                    : '剩 $remaining 题',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          ClipRRect(
            borderRadius: BorderRadius.circular(3.r),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              minHeight: 5.h,
            ),
          ),
        ],
      ),
    );
  }
}
