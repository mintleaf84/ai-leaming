import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_icons.dart';
import '../../../domain/exam_question.dart';
import '../../../domain/exam_submit_result.dart';

/// 逐题回顾里的一条（题号、题干、对错、答案与解析）。
typedef ExamResultEntry = ({
  int number,
  ExamQuestion? question,
  ExamQuestionResult item,
});

class ExamResultQuestionRow extends StatelessWidget {
  const ExamResultQuestionRow({
    super.key,
    required this.entry,
    required this.colors,
    required this.answers,
  });

  final ExamResultEntry entry;
  final AppColors colors;
  final Map<int, String> answers;

  @override
  Widget build(BuildContext context) {
    final item = entry.item;
    final mine = answers[item.questionId]?.trim() ?? '';
    final baseColor = item.isCorrect ? colors.success : colors.error;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 12.h),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 24.w,
                height: 24.w,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: item.isCorrect
                      ? colors.successContainer
                      : colors.errorContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  item.isCorrect ? AppIcons.check : AppIcons.close,
                  size: 13.sp,
                  color: baseColor,
                ),
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  entry.question?.content ?? '第 ${entry.number} 题',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.sp,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                    color: colors.text,
                  ),
                ),
              ),
              SizedBox(width: 8.w),
              Text(
                item.isCorrect ? '答对' : '答错',
                style: TextStyle(
                  fontSize: 11.sp,
                  fontWeight: FontWeight.w600,
                  color: baseColor,
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          if (mine.isNotEmpty)
            _AnswerLine(
              label: '你的答案',
              value: mine,
              color: item.isCorrect ? colors.success : colors.error,
            ),
          if (item.correctAnswer.isNotEmpty)
            _AnswerLine(
              label: '正确答案',
              value: item.correctAnswer,
              color: colors.success,
            ),
          if ((item.explanation ?? '').trim().isNotEmpty) ...[
            SizedBox(height: 4.h),
            Text(
              item.explanation!.trim(),
              style: TextStyle(
                fontSize: 12.sp,
                height: 1.6,
                color: colors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AnswerLine extends StatelessWidget {
  const _AnswerLine({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: 3.h),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label：',
              style: TextStyle(color: context.colors.textSecondary),
            ),
            TextSpan(
              text: value,
              style: TextStyle(color: color, fontWeight: FontWeight.w600),
            ),
          ],
        ),
        style: TextStyle(fontSize: 12.sp, height: 1.5),
      ),
    );
  }
}
