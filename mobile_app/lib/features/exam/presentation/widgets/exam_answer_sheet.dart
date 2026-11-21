import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/exam_question.dart';

/// 答题卡抽屉：一眼看到哪些题答了、点数字直接跳过去。
///
/// 用 `Wrap` 而不是 `GridView`：题量上限是几十道，固定列数在窄屏上会把数字挤成
/// 两行；Wrap 只保证「一格不窄于 44dp」，一行放几个由屏宽自然决定。
class ExamAnswerSheet extends StatelessWidget {
  const ExamAnswerSheet({
    super.key,
    required this.questions,
    required this.answers,
    required this.currentIndex,
  });

  final List<ExamQuestion> questions;

  /// 题号 → 作答原文（已答才在表里）。
  final Map<int, String> answers;
  final int currentIndex;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final answered = questions
        .where((question) => (answers[question.id] ?? '').trim().isNotEmpty)
        .length;
    final unanswered = questions.length - answered;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.72,
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 20.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '答题卡',
                      style: TextStyle(
                        fontSize: 17.sp,
                        fontWeight: FontWeight.w700,
                        color: colors.text,
                      ),
                    ),
                  ),
                  Text(
                    '已答 $answered / ${questions.length}',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                  SizedBox(width: 4.w),
                  IconButton(
                    tooltip: '关闭答题卡',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: Icon(
                      AppIcons.close,
                      size: 18.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
              if (unanswered > 0) ...[
                SizedBox(height: 2.h),
                Text(
                  '还有 $unanswered 道没答，未作答会按错计入成绩。',
                  style: TextStyle(
                    fontSize: 12.sp,
                    height: 1.5,
                    color: colors.warning,
                  ),
                ),
              ],
              SizedBox(height: 14.h),
              Flexible(
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 8.w,
                    runSpacing: 8.h,
                    children: [
                      for (var index = 0; index < questions.length; index++)
                        _SheetCell(
                          number: index + 1,
                          answered: (answers[questions[index].id] ?? '')
                              .trim()
                              .isNotEmpty,
                          current: index == currentIndex,
                          onTap: () => Navigator.of(context).pop(index),
                        ),
                    ],
                  ),
                ),
              ),
              SizedBox(height: 12.h),
              Row(
                children: [
                  _LegendDot(color: colors.accentContainer, label: '已答'),
                  SizedBox(width: 14.w),
                  _LegendDot(
                    color: colors.surfaceAlt,
                    border: colors.border,
                    label: '没答',
                  ),
                  SizedBox(width: 14.w),
                  _LegendDot(
                    color: colors.surfaceAlt,
                    border: colors.accent,
                    label: '当前',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetCell extends StatelessWidget {
  const _SheetCell({
    required this.number,
    required this.answered,
    required this.current,
    required this.onTap,
  });

  final int number;
  final bool answered;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      button: true,
      selected: current,
      label: '第 $number 题${answered ? '，已作答' : '，未作答'}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.r),
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: answered ? colors.accentContainer : colors.surfaceAlt,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(
              color: current
                  ? colors.accent
                  : answered
                  ? colors.accent.withValues(alpha: 0.35)
                  : colors.border,
              width: current ? 2 : 1,
            ),
          ),
          child: Text(
            '$number',
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: current || answered
                  ? FontWeight.w700
                  : FontWeight.w500,
              color: answered ? colors.accent : colors.textSecondary,
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label, this.border});

  final Color color;
  final Color? border;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4.r),
            border: Border.all(color: border ?? color),
          ),
        ),
        SizedBox(width: 6.w),
        Text(
          label,
          style: TextStyle(
            fontSize: 11.sp,
            color: context.colors.textSecondary,
          ),
        ),
      ],
    );
  }
}
