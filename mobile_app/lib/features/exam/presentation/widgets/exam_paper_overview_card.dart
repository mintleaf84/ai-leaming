import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/exam_paper.dart';
import '../../domain/exam_submit_result.dart';

/// 顶部概览：共几份、做过几次、最好成绩。
///
/// 三个数都来自列表响应本身，不发额请求；「最好成绩」取各卷 `bestScore` 的最大值，
/// 没有成绩时显示「—」而不是 0 分（0 分是真实成绩，不能用来表示「没有」）。
class ExamPaperOverviewCard extends StatelessWidget {
  const ExamPaperOverviewCard({super.key, required this.papers});

  final List<ExamPaper> papers;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final attempts = papers.fold<int>(
      0,
      (sum, paper) => sum + paper.attemptCount,
    );
    final best = papers
        .map((paper) => examScorePercent(paper.bestScore))
        .fold<double>(0, math.max);
    final hasBest = papers.any((paper) => paper.bestScore != null);

    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18.r),
        border: Border.all(color: colors.border),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -6.w,
            top: -16.h,
            child: Opacity(
              opacity: 0.08,
              child: Text('📝', style: TextStyle(fontSize: 88.sp)),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '整卷练习',
                style: TextStyle(
                  fontSize: 20.sp,
                  fontWeight: FontWeight.w700,
                  color: colors.text,
                  letterSpacing: -0.2,
                ),
              ),
              SizedBox(height: 6.h),
              Text(
                '限时做完再统一批改，成绩和错题会一起进历史与错题本。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.6,
                  color: colors.textSecondary,
                ),
              ),
              SizedBox(height: 18.h),
              Row(
                children: [
                  _OverviewStat(label: '试卷', value: '${papers.length} 份'),
                  _OverviewDivider(color: colors.border),
                  _OverviewStat(label: '作答', value: '$attempts 次'),
                  _OverviewDivider(color: colors.border),
                  _OverviewStat(
                    label: '最好成绩',
                    value: hasBest ? '${best.round()} 分' : '—',
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OverviewStat extends StatelessWidget {
  const _OverviewStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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

class _OverviewDivider extends StatelessWidget {
  const _OverviewDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 28.h,
      margin: EdgeInsets.symmetric(horizontal: 12.w),
      color: color,
    );
  }
}
