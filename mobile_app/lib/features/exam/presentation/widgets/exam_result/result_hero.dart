import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/exam_submit_result.dart';

/// 成绩单顶部的分数环 + 一句评语 + 成绩去向说明。
class ExamResultHero extends StatelessWidget {
  const ExamResultHero({super.key, required this.result, required this.colors});

  final ExamSubmitResult result;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    final percent = result.percent;
    final headline = percent >= 85
        ? '这次很稳'
        : percent >= 60
        ? '及格了，还能再提'
        : '这次有点难';
    return Column(
      children: [
        SizedBox(height: 12.h),
        SizedBox(
          width: 132.w,
          height: 132.w,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 132.w,
                height: 132.w,
                child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0, end: percent / 100),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (context, value, child) => CircularProgressIndicator(
                    value: value,
                    strokeWidth: 8,
                    backgroundColor: colors.surfaceAlt,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      percent >= 60 ? colors.accent : colors.warning,
                    ),
                  ),
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: percent),
                    duration: const Duration(milliseconds: 700),
                    curve: Curves.easeOutCubic,
                    builder: (context, value, child) => Text(
                      '${value.round()}',
                      style: TextStyle(
                        fontSize: 40.sp,
                        fontWeight: FontWeight.w700,
                        height: 1,
                        color: colors.text,
                        fontFeatures: const <FontFeature>[
                          FontFeature.tabularFigures(),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(height: 2.h),
                  Text(
                    '分',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        SizedBox(height: 16.h),
        Text(
          headline,
          style: TextStyle(
            fontSize: 20.sp,
            fontWeight: FontWeight.w700,
            color: colors.text,
            letterSpacing: -0.2,
          ),
        ),
        SizedBox(height: 6.h),
        Text(
          result.duplicate ? '这场之前已经交过卷，显示的是当时那份结果。' : '成绩已记入练习历史，做错的题也进了错题本。',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12.sp,
            height: 1.6,
            color: colors.textSecondary,
          ),
        ),
      ],
    );
  }
}
