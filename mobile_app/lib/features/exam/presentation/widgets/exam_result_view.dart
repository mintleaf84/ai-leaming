import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/exam_question.dart';
import '../../domain/exam_submit_result.dart';
import 'exam_result/result_actions.dart';
import 'exam_result/result_flags.dart';
import 'exam_result/result_hero.dart';
import 'exam_result/result_question_row.dart';
import 'exam_result/result_stats.dart';

/// 成绩单：得分、正确率、用时、逐题对错与解析。
///
/// 数据全部来自交卷响应（或已交卷的 `GET /attempts/{id}`），本地不重算分数——
/// 「屏上 85 分、服务端记 83 分」这种偏差比少一个动画严重得多。
class ExamResultView extends StatelessWidget {
  const ExamResultView({
    super.key,
    required this.result,
    required this.questions,
    required this.answers,
    this.onRetryWrong,
    required this.onBack,
  });

  final ExamSubmitResult result;

  /// 本场题目（用于在逐题回顾里显示题干）。
  final List<ExamQuestion> questions;

  /// 本机作答（深链接重新打开时为空，此时只显示正确答案）。
  final Map<int, String> answers;
  final VoidCallback? onRetryWrong;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final items = _orderedResults();

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(20.w, 8.h, 20.w, 24.h),
            children: [
              ExamResultHero(result: result, colors: colors),
              SizedBox(height: 20.h),
              ExamResultStats(result: result, colors: colors),
              if (result.duplicate || result.overtime) ...[
                SizedBox(height: 12.h),
                ExamResultFlags(result: result, colors: colors),
              ],
              SizedBox(height: 24.h),
              Row(
                children: [
                  Text(
                    '逐题回顾',
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.w700,
                      color: colors.text,
                    ),
                  ),
                  SizedBox(width: 8.w),
                  Text(
                    '答对 ${result.correctCount} / ${result.totalQuestions}',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                ],
              ),
              SizedBox(height: 12.h),
              if (items.isEmpty)
                Text(
                  '这次没有返回逐题结果，只能看到总分。',
                  style: TextStyle(
                    fontSize: 12.sp,
                    height: 1.5,
                    color: colors.textSecondary,
                  ),
                )
              else
                for (final entry in items) ...[
                  ExamResultQuestionRow(
                    entry: entry,
                    colors: colors,
                    answers: answers,
                  ),
                  SizedBox(height: 10.h),
                ],
            ],
          ),
        ),
        ExamResultActions(
          onRetryWrong: onRetryWrong,
          onBack: onBack,
          colors: colors,
        ),
      ],
    );
  }

  /// 逐题结果按本场题序排列；服务端没给某题结果时跳过（不编造对错）。
  List<ExamResultEntry> _orderedResults() {
    final byId = <int, ExamQuestion>{
      for (final question in questions) question.id: question,
    };
    final numberById = <int, int>{
      for (var index = 0; index < questions.length; index++)
        questions[index].id: index + 1,
    };
    final out = <ExamResultEntry>[];
    for (var index = 0; index < result.perQuestion.length; index++) {
      final item = result.perQuestion[index];
      out.add((
        number: numberById[item.questionId] ?? index + 1,
        question: byId[item.questionId],
        item: item,
      ));
    }
    return out;
  }
}
