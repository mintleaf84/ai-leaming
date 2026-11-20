import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/first_principles_section.dart';
import '../../domain/practice_log.dart';
import 'question_parts.dart';

/// 沉浸模式的一页题：题号徽标 + 题干 + 选项 + 解析。
class HistoryImmersiveQuestionCard extends StatelessWidget {
  const HistoryImmersiveQuestionCard({
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
      margin: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(20.r),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.h),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: borderColor)),
            ),
            child: Row(
              children: [
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: 10.w,
                    vertical: 4.h,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: Text(
                    '第 $questionNumber 题',
                    style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.bold,
                      color: isCorrect
                          ? context.colors.onSuccess
                          : context.colors.onError,
                    ),
                  ),
                ),
                SizedBox(width: 8.w),
                if (!isCorrect)
                  Text(
                    '答错了',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: statusColor,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                const Spacer(),
                // Tags could go here
              ],
            ),
          ),
          // Scrollable Content
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(20.w),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  HistoryTagWrap(
                    tags: log.tags,
                    secondaryColor: secondaryColor,
                  ),
                  SizedBox(height: 12.h),
                  Text(
                    log.questionContent,
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.w600,
                      color: textColor,
                      height: 1.5,
                    ),
                  ),
                  SizedBox(height: 24.h),
                  HistoryOptionsList(
                    log: log,
                    textColor: textColor,
                    borderColor: borderColor,
                  ),
                  SizedBox(height: 24.h),
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
          ),
        ],
      ),
    );
  }
}
