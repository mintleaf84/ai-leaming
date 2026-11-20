import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/exam_submit_result.dart';
import '../../exam_format.dart';

/// 正确率 / 答对 / 用时三格。
class ExamResultStats extends StatelessWidget {
  const ExamResultStats({
    super.key,
    required this.result,
    required this.colors,
  });

  final ExamSubmitResult result;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(vertical: 14.h),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          _StatCell(
            label: '正确率',
            value: '${result.accuracy.round()}%',
            colors: colors,
          ),
          _StatDivider(color: colors.border),
          _StatCell(
            label: '答对',
            value: '${result.correctCount}/${result.totalQuestions}',
            colors: colors,
          ),
          _StatDivider(color: colors.border),
          _StatCell(
            label: '用时',
            value: formatExamDuration(result.durationMs),
            colors: colors,
          ),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({
    required this.label,
    required this.value,
    required this.colors,
  });

  final String label;
  final String value;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.w700,
              color: colors.text,
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
          SizedBox(height: 2.h),
          Text(
            label,
            style: TextStyle(fontSize: 11.sp, color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 26.h, color: color);
  }
}
