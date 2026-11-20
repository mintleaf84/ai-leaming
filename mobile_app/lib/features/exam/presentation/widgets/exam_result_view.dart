import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/exam_question.dart';
import '../../domain/exam_submit_result.dart';
import '../exam_format.dart';

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
              _buildHero(colors),
              SizedBox(height: 20.h),
              _buildStats(colors),
              if (result.duplicate || result.overtime) ...[
                SizedBox(height: 12.h),
                _buildFlags(colors),
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
                  _buildQuestionRow(entry, colors),
                  SizedBox(height: 10.h),
                ],
            ],
          ),
        ),
        _buildActions(colors),
      ],
    );
  }

  /// 逐题结果按本场题序排列；服务端没给某题结果时跳过（不编造对错）。
  List<({int number, ExamQuestion? question, ExamQuestionResult item})>
  _orderedResults() {
    final byId = <int, ExamQuestion>{
      for (final question in questions) question.id: question,
    };
    final numberById = <int, int>{
      for (var index = 0; index < questions.length; index++)
        questions[index].id: index + 1,
    };
    final out =
        <({int number, ExamQuestion? question, ExamQuestionResult item})>[];
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

  Widget _buildHero(AppColors colors) {
    final percent = result.percent;
    final headline = percent >= 85
        ? '这次很稳'
        : percent >= 60
        ? '及格了，还能再提'
        : '这次有点难';
    return Column(
      children: [
        SizedBox(height: 12.h),
        SizedBox(
          width: 132.w,
          height: 132.w,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 132.w,
                height: 132.w,
                child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0, end: percent / 100),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (context, value, child) => CircularProgressIndicator(
                    value: value,
                    strokeWidth: 8,
                    backgroundColor: colors.surfaceAlt,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      percent >= 60 ? colors.accent : colors.warning,
                    ),
                  ),
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: percent),
                    duration: const Duration(milliseconds: 700),
                    curve: Curves.easeOutCubic,
                    builder: (context, value, child) => Text(
                      '${value.round()}',
                      style: TextStyle(
                        fontSize: 40.sp,
                        fontWeight: FontWeight.w700,
                        height: 1,
                        color: colors.text,
                        fontFeatures: const <FontFeature>[
                          FontFeature.tabularFigures(),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(height: 2.h),
                  Text(
                    '分',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        SizedBox(height: 16.h),
        Text(
          headline,
          style: TextStyle(
            fontSize: 20.sp,
            fontWeight: FontWeight.w700,
            color: colors.text,
            letterSpacing: -0.2,
          ),
        ),
        SizedBox(height: 6.h),
        Text(
          result.duplicate ? '这场之前已经交过卷，显示的是当时那份结果。' : '成绩已记入练习历史，做错的题也进了错题本。',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12.sp,
            height: 1.6,
            color: colors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildStats(AppColors colors) {
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

  Widget _buildFlags(AppColors colors) {
    return Wrap(
      spacing: 8.w,
      runSpacing: 8.h,
      children: [
        if (result.overtime)
          _Flag(
            icon: AppIcons.accessTime,
            text: formatExamOvertime(result.overtimeMs),
            background: colors.warningContainer,
            foreground: colors.warning,
          ),
        if (result.duplicate)
          _Flag(
            icon: AppIcons.infoOutline,
            text: '重复提交，未重复计分',
            background: colors.surfaceAlt,
            foreground: colors.textSecondary,
          ),
      ],
    );
  }

  Widget _buildQuestionRow(
    ({int number, ExamQuestion? question, ExamQuestionResult item}) entry,
    AppColors colors,
  ) {
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

  Widget _buildActions(AppColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 12.h),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (onRetryWrong != null) ...[
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: OutlinedButton(
                    onPressed: onRetryWrong,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.text,
                      side: BorderSide(color: colors.border),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10.r),
                      ),
                    ),
                    child: Text(
                      '错题重练',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
              SizedBox(width: 10.w),
            ],
            Expanded(
              child: SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: onBack,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.primary,
                    foregroundColor: colors.onPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10.r),
                    ),
                  ),
                  child: Text(
                    '返回',
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
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

class _Flag extends StatelessWidget {
  const _Flag({
    required this.icon,
    required this.text,
    required this.background,
    required this.foreground,
  });

  final IconData icon;
  final String text;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 5.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6.r),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13.sp, color: foreground),
          SizedBox(width: 5.w),
          Text(
            text,
            style: TextStyle(
              fontSize: 11.sp,
              fontWeight: FontWeight.w600,
              color: foreground,
            ),
          ),
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
