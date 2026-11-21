import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/question.dart';
import 'question_preview_sheet.dart';

/// 全量题库列表里的一张题目卡。
///
/// 从 `question_list_screen.dart` 原样搬出：真实列表与骨架屏共用同一份布局，
/// 点击打开预览弹层（`showQuestionPreview`）。
class QuestionListCard extends StatelessWidget {
  const QuestionListCard({super.key, required this.question});

  final Question question;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = context.colors.textSecondary;
    final borderColor = theme.dividerColor;

    return Container(
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: borderColor),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            showQuestionPreview(context, question);
          },
          borderRadius: BorderRadius.circular(8.r),
          child: Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 6.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: question.type == 'single'
                            ? const Color(0xFFE3F2FD)
                            : const Color(0xFFF3E5F5),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        question.type == 'single' ? '单选' : '多选',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: question.type == 'single'
                              ? const Color(0xFF1976D2)
                              : const Color(0xFF7B1FA2),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Expanded(
                      child: Text(
                        question.dimension ?? '综合能力',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: secondaryColor,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      'ID: ${question.id}',
                      style: TextStyle(
                        fontSize: 10.sp,
                        color: secondaryColor.withValues(alpha: 0.5),
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 12.h),
                Text(
                  question.content,
                  style: TextStyle(
                    fontSize: 15.sp,
                    color: textColor,
                    height: 1.4,
                  ),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                if (question.tags.isNotEmpty) ...[
                  SizedBox(height: 12.h),
                  Wrap(
                    spacing: 8.w,
                    runSpacing: 4.h,
                    children: question.tags
                        .map(
                          (tag) => Text(
                            '#$tag',
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: context.colors.accent,
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
