import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/widgets/first_principles_section.dart';
import '../../domain/practice_log.dart';
import 'question_parts.dart';

/// 清单模式的一道题：题号 + 题干，展开后是选项、解析与第一性原理。
class HistoryQuestionCard extends StatelessWidget {
  const HistoryQuestionCard({
    super.key,
    required this.questionNumber,
    required this.log,
    required this.cardColor,
    required this.textColor,
    required this.secondaryColor,
    required this.borderColor,
  });

  final int questionNumber;
  final PracticeLog log;
  final Color cardColor;
  final Color textColor;
  final Color secondaryColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final isCorrect = log.isCorrect;
    final statusColor = isCorrect
        ? context.colors.success
        : context.colors.error;

    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: borderColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12.r),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(width: 4.w, height: 80.h, color: statusColor),
            Expanded(
              child: ExpansionTile(
                tilePadding: EdgeInsets.symmetric(
                  horizontal: 12.w,
                  vertical: 4.h,
                ),
                childrenPadding: EdgeInsets.zero,
                leading: Container(
                  width: 32.w,
                  height: 32.h,
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8.r),
                  ),
                  child: Center(
                    child: Text(
                      '$questionNumber',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                      ),
                    ),
                  ),
                ),
                title: _QuestionTitle(
                  log: log,
                  textColor: textColor,
                  secondaryColor: secondaryColor,
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isCorrect ? AppIcons.checkCircle : AppIcons.cancelSolid,
                      size: 20.sp,
                      color: statusColor,
                    ),
                    SizedBox(width: 4.w),
                    Icon(
                      AppIcons.expandMore,
                      size: 20.sp,
                      color: secondaryColor,
                    ),
                  ],
                ),
                iconColor: secondaryColor,
                collapsedIconColor: secondaryColor,
                children: [
                  Container(
                    padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 16.h),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Divider(color: borderColor, height: 1),
                        SizedBox(height: 12.h),
                        HistoryOptionsList(
                          log: log,
                          textColor: textColor,
                          borderColor: borderColor,
                        ),
                        if (log.explanation.isNotEmpty)
                          HistoryExplanation(
                            explanation: log.explanation,
                            textColor: textColor,
                            secondaryColor: secondaryColor,
                          ),
                        FirstPrinciplesSection(log: log),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuestionTitle extends StatelessWidget {
  const _QuestionTitle({
    required this.log,
    required this.textColor,
    required this.secondaryColor,
  });

  final PracticeLog log;
  final Color textColor;
  final Color secondaryColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (log.tags.isNotEmpty)
          Padding(
            padding: EdgeInsets.only(bottom: 6.h),
            child: HistoryTagWrap(
              tags: log.tags,
              secondaryColor: secondaryColor,
            ),
          ),
        Text(
          log.questionContent,
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w500,
            color: textColor,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}
