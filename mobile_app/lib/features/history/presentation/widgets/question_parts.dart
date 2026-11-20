import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/practice_log.dart';

/// 题干下的标签串（清单卡片与沉浸卡片共用）。
class HistoryTagWrap extends StatelessWidget {
  const HistoryTagWrap({
    super.key,
    required this.tags,
    required this.secondaryColor,
  });

  final List<String> tags;
  final Color secondaryColor;

  @override
  Widget build(BuildContext context) {
    if (tags.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6.w,
      runSpacing: 4.h,
      children: tags
          .map(
            (tag) => Container(
              padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
              decoration: BoxDecoration(
                color: secondaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(4.r),
              ),
              child: Text(
                tag,
                style: TextStyle(fontSize: 12.sp, color: secondaryColor),
              ),
            ),
          )
          .toList(),
    );
  }
}

/// 选项列表：标出正确答案与「选错了」的选项。
class HistoryOptionsList extends StatelessWidget {
  const HistoryOptionsList({
    super.key,
    required this.log,
    required this.textColor,
    required this.borderColor,
  });

  final PracticeLog log;
  final Color textColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: log.options.asMap().entries.map((entry) {
        final index = entry.key;
        final optionText = entry.value;
        final optionLabel = String.fromCharCode(65 + index);

        final bool isSelected = log.userAnswer == optionLabel;
        final bool isTargetCorrect = log.correctAnswer == optionLabel;

        Color optionBg = Colors.transparent;
        Color optionBorder = borderColor.withValues(alpha: 0.5);
        Color optionTextCol = textColor;

        if (isTargetCorrect) {
          optionBg = context.colors.successContainer;
          optionBorder = context.colors.success;
          optionTextCol = context.colors.success;
        } else if (isSelected && !log.isCorrect) {
          optionBg = context.colors.errorContainer;
          optionBorder = context.colors.error;
          optionTextCol = context.colors.error;
        }

        return Container(
          margin: EdgeInsets.only(bottom: 8.h),
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
          decoration: BoxDecoration(
            color: optionBg,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: optionBorder),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$optionLabel.',
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.bold,
                  color: optionTextCol,
                ),
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  optionText,
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: optionTextCol,
                    height: 1.4,
                  ),
                ),
              ),
              if (isTargetCorrect)
                Icon(AppIcons.checkCircle, size: 16.sp, color: optionBorder),
              if (isSelected && !log.isCorrect)
                Icon(AppIcons.cancelSolid, size: 16.sp, color: optionBorder),
            ],
          ),
        );
      }).toList(),
    );
  }
}

/// 解析块（带灯泡标题）。
class HistoryExplanation extends StatelessWidget {
  const HistoryExplanation({
    super.key,
    required this.explanation,
    required this.textColor,
    required this.secondaryColor,
  });

  final String explanation;
  final Color textColor;
  final Color secondaryColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(top: 16.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: secondaryColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                AppIcons.lightbulbOutline,
                size: 18.sp,
                color: context.colors.warning,
              ),
              SizedBox(width: 6.w),
              Text(
                '解析',
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.bold,
                  color: textColor,
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          Text(
            explanation,
            style: TextStyle(fontSize: 14.sp, color: textColor, height: 1.6),
          ),
        ],
      ),
    );
  }
}
