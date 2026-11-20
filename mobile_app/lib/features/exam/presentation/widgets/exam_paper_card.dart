import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/exam_paper.dart';
import '../../domain/exam_submit_result.dart';
import '../exam_format.dart';

/// 一张试卷的卡片：名称、题量/时限/来源、最好成绩与作答次数。
class ExamPaperCard extends StatelessWidget {
  const ExamPaperCard({super.key, required this.paper, required this.onTap});

  final ExamPaper paper;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final score = examScorePercent(paper.bestScore);
    final lastAt = formatExamDateTime(paper.lastAttemptAt);

    return Semantics(
      button: true,
      label: '${paper.title}，${paper.totalQuestions} 题，${paper.durationLabel}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14.r),
        child: Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14.r),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      paper.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 16.sp,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                        color: colors.text,
                      ),
                    ),
                    SizedBox(height: 8.h),
                    Wrap(
                      spacing: 6.w,
                      runSpacing: 6.h,
                      children: [
                        _MetaChip(
                          label: '${paper.totalQuestions} 题',
                          background: colors.accentContainer,
                          foreground: colors.accent,
                        ),
                        _MetaChip(
                          label: paper.isTimed
                              ? '限时 ${paper.durationMinutes} 分钟'
                              : '固定题量',
                          background: paper.isTimed
                              ? colors.warningContainer
                              : colors.surfaceAlt,
                          foreground: paper.isTimed
                              ? colors.warning
                              : colors.textSecondary,
                        ),
                        _MetaChip(
                          label: paper.source == 'auto' ? '自动' : '手工',
                          background: colors.successContainer,
                          foreground: colors.success,
                        ),
                      ],
                    ),
                    if (lastAt != null) ...[
                      SizedBox(height: 8.h),
                      Text(
                        '最近作答 $lastAt',
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SizedBox(width: 12.w),
              SizedBox(
                width: 72.w,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (paper.bestScore == null)
                      Text(
                        '未作答',
                        style: TextStyle(
                          fontSize: 13.sp,
                          fontWeight: FontWeight.w600,
                          color: colors.textSecondary,
                        ),
                      )
                    else
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '${score.round()}',
                            style: TextStyle(
                              fontSize: 26.sp,
                              fontWeight: FontWeight.w700,
                              height: 1,
                              color: colors.text,
                              fontFeatures: const <FontFeature>[
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                          SizedBox(width: 2.w),
                          Text(
                            '分',
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: colors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    SizedBox(height: 4.h),
                    Text(
                      paper.bestScore == null ? '开始第一场' : '最好成绩',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                    if (paper.attemptCount > 0) ...[
                      SizedBox(height: 2.h),
                      Text(
                        '做过 ${paper.attemptCount} 次',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                    SizedBox(height: 4.h),
                    Icon(
                      AppIcons.chevronRight,
                      size: 18.sp,
                      color: colors.textSecondary,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 7.w, vertical: 3.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(5.r),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.sp,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}
