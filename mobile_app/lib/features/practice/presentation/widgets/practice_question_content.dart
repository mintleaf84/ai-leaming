import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/domain/question_practicability.dart';
import '../../../../shared/widgets/animated_option_card.dart';
import '../../domain/fill_blank_answer.dart';
import '../../domain/question.dart';
import '../practice_provider.dart';
import 'fill_blank_answer_fields.dart';
import 'first_principles_panel.dart';
import 'practice_question_header.dart';
import 'question_material_card.dart';

/// 练习屏的可滚动题目区：面包屑 → 题型标签 → 材料卡 → 题干 → 选项 → 解析面板。
///
/// 从 `practice_screen.dart` 的 `_buildQuestionView` 原样搬出：选项点击仍直接
/// 落到控制器，答案高亮/禁用规则与文案一字未改。
class PracticeQuestionContent extends ConsumerWidget {
  const PracticeQuestionContent({super.key, required this.state});

  final PracticeSessionState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final question = state.currentQuestion!;
    final selectedAnswers = state.userAnswers[question.id] ?? [];
    final result = state.results[question.id];
    final isMulti = question.type == 'multi';
    final isFillBlank = question.isFillBlank;
    // 契约里合法但本版本不支持作答的题型（如 `drag_match`）：不可作答 + 提示更新，
    // 不再按单选渲染空选项让用户白挨一个错。判定只在 isPracticable 一处定义。
    final isPracticable = question.isPracticable;
    // 填空题要渲染几个空（口径只在 domain/fill_blank_answer.dart 一处）。
    final blankSlots = fillBlankSlotsFor(question);
    // 正确答案列表（多选可能是 JSON 数组）
    final correctAnswerRaw = state.correctAnswers[question.id];
    List<String> correctAnswerList = [];
    if (correctAnswerRaw != null) {
      try {
        correctAnswerList = List<String>.from(jsonDecode(correctAnswerRaw));
      } catch (_) {
        correctAnswerList = [correctAnswerRaw];
      }
    }

    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(horizontal: 20.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 16.h),
          // Breadcrumb (真实模式，见 PracticeBreadcrumb)
          PracticeBreadcrumb(mode: state.mode),
          SizedBox(height: 24.h),
          // 题型标签（未知题型给中性灰，不冒充「单选题」）
          _QuestionTypeTag(question: question),
          SizedBox(height: 12.h),
          // 材料题：材料卡在题干上方（无材料时整块不占位）
          QuestionMaterialCard(
            material: question.material,
            materialHtml: question.materialHtml,
          ),
          // Question Icon & Text
          Text('📜', style: TextStyle(fontSize: 40.sp)),
          SizedBox(height: 16.h),
          Text(
            question.content,
            style: TextStyle(
              fontSize: 22.sp,
              fontWeight: FontWeight.w600,
              height: 1.4,
              color: context.colors.text,
            ),
          ),
          SizedBox(height: 32.h),
          if (!isPracticable)
            // 未知题型的兜底：给原因、给出路，而不是让用户对着一片空白挨错。
            Container(
              width: double.infinity,
              padding: EdgeInsets.all(16.w),
              decoration: BoxDecoration(
                color: context.colors.surface.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(8.r),
                border: Border.all(
                  color: context.colors.text.withValues(alpha: 0.12),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '此题型需要更新 App 后才能练习',
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                      height: 1.5,
                      color: context.colors.text,
                    ),
                  ),
                  SizedBox(height: 6.h),
                  Text(
                    '当前版本还不认识这道题的题型，已跳过判分。'
                    '用「下一题」继续练习，或到应用商店检查更新。',
                    style: TextStyle(
                      fontSize: 13.sp,
                      height: 1.6,
                      color: context.colors.text.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
            )
          else if (isFillBlank)
            // 填空题：按空数渲染输入框，逐空写回控制器（key 跟着题走，
            // 换题时换一套 controller，`answers` 会从 state 重新读）。
            FillBlankAnswerFields(
              key: ValueKey<String>('fill_blank_${question.id}'),
              questionId: question.id,
              blankCount: blankSlots,
              answers: selectedAnswers,
              judged: result != null,
            )
          else
            // 选项卡片（带动效）
            ...question.options.asMap().entries.map((entry) {
              final index = entry.key;
              final option = entry.value;
              final optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              final isSelected = selectedAnswers.contains(optionLabel);
              // 多选时：高亮所有正确选项
              final isCorrectOption =
                  result != null && correctAnswerList.contains(optionLabel);
              return AnimatedOptionCard(
                label: optionLabel,
                text: option,
                isSelected: isSelected,
                isMultiSelect: isMulti,
                isCorrect: isCorrectOption && isSelected,
                isWrong: result == false && isSelected && !isCorrectOption,
                showCorrectHint: result != null && isCorrectOption,
                onTap: result == null
                    ? () => ref
                          .read(practiceControllerProvider.notifier)
                          .toggleAnswer(optionLabel)
                    : null,
              );
            }),
          if (result != null) ...[
            SizedBox(height: 32.h),
            PracticeExplanationPanel(
              state: state,
              question: question,
              isCorrect: result,
            ),
          ],
          SizedBox(height: 120.h), // Space for bottom nav
        ],
      ),
    );
  }
}

/// 题型标签：文案与配色按题型逐条列出，未知题型给中性灰（不冒充「单选题」）。
///
/// 单独成一个控件而不是三组嵌套三元：同一条「这是什么题型」原本要在背景、边框、
/// 文字三处各判断一遍，加一个题型就要改三处——填空（`fill_blank`）就是这么加进来的。
class _QuestionTypeTag extends StatelessWidget {
  const _QuestionTypeTag({required this.question});

  final Question question;

  @override
  Widget build(BuildContext context) {
    final (label, background, foreground) = switch (question) {
      final q when !q.isPracticable => (
        '未知题型',
        context.colors.surface,
        context.colors.text.withValues(alpha: 0.55),
      ),
      // 填空题：与网页端同一套青色（网页端也用 teal 标填空）。
      final q when q.isFillBlank => (
        '填空题',
        const Color(0xFFE0F2F1),
        const Color(0xFF00695C),
      ),
      final q when q.type == 'truefalse' => (
        '判断题',
        context.colors.warningContainer,
        context.colors.warning,
      ),
      final q when q.type == 'multi' => (
        '多选题',
        const Color(0xFFF3E5F5),
        const Color(0xFF7B1FA2),
      ),
      _ => ('单选题', const Color(0xFFE3F2FD), const Color(0xFF1976D2)),
    };

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(4.r),
        border: question.isPracticable
            ? null
            : Border.all(color: context.colors.text.withValues(alpha: 0.15)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12.sp,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}

/// 判分后的解析面板（对错标题 / 正确答案 / AI 解析 / 第一性原理入口）。
///
/// 从 `practice_screen.dart` 的 `_buildExplanationPanel` 原样搬出，仅把
/// 「是本 State 的方法」换成 `ConsumerWidget`（读的还是同一个控制器）。
class PracticeExplanationPanel extends ConsumerWidget {
  const PracticeExplanationPanel({
    super.key,
    required this.state,
    required this.question,
    required this.isCorrect,
  });

  final PracticeSessionState state;
  final Question question;
  final bool isCorrect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final correctAnswerRaw = state.correctAnswers[question.id] ?? '...';
    // 展示形式按题型分：填空题的正确答案是 `；` 拼起来的单串，按空序逐行才看得出
    // 哪一空错了；多选题解出 JSON 数组；其它按原串。
    String displayAnswer;
    if (question.isFillBlank) {
      displayAnswer = formatFillBlankAnswer(correctAnswerRaw);
    } else {
      try {
        final parsed = jsonDecode(correctAnswerRaw);
        if (parsed is List) {
          displayAnswer = parsed.join(', ');
        } else {
          displayAnswer = correctAnswerRaw;
        }
      } catch (_) {
        displayAnswer = correctAnswerRaw;
      }
    }
    final explanation = state.explanations[question.id];
    // 填空题判分后输入框是只读的，这里再按空序列一遍已提交的答案：
    // 用户回到这一题时能对上「我哪一空写的是什么」。
    final userBlanks = state.userAnswers[question.id] ?? const <String>[];

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: isCorrect
            ? context.colors.successContainer
            : context.colors.errorContainer,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(
          color: isCorrect
              ? context.colors.success.withValues(alpha: 0.4)
              : context.colors.error.withValues(alpha: 0.4),
          width: 0.5,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 2.h),
            child: Text(
              isCorrect ? '💡' : '⚠️',
              style: TextStyle(fontSize: 18.sp),
            ),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCorrect ? '回答正确' : '回答错误',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                    color: isCorrect
                        ? context.colors.success
                        : context.colors.error,
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  '正确答案：$displayAnswer',
                  style: TextStyle(
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w600,
                    color: context.colors.text,
                  ),
                ),
                if (question.isFillBlank && userBlanks.isNotEmpty) ...[
                  SizedBox(height: 8.h),
                  Text(
                    '你的答案：${formatFillBlankBlanks(userBlanks)}',
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: context.colors.text,
                    ),
                  ),
                ],
                if (state.isLoading || explanation != null) ...[
                  SizedBox(height: 12.h),
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(12.w),
                    decoration: BoxDecoration(
                      color: context.colors.surface.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(6.r),
                    ),
                    child: state.isLoading
                        ? Row(
                            children: [
                              SizedBox(
                                height: 14.w,
                                width: 14.w,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.colors.accent,
                                ),
                              ),
                              SizedBox(width: 8.w),
                              Text(
                                '正在生成解析...',
                                style: TextStyle(
                                  fontSize: 13.sp,
                                  color: context.colors.textSecondary,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            explanation!,
                            style: TextStyle(
                              fontSize: 14.sp,
                              height: 1.6,
                              color: context.colors.text.withValues(alpha: 0.9),
                            ),
                          ),
                  ),
                ],
                SizedBox(height: 16.h),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      // 触发并显示 AI 分析
                      ref
                          .read(practiceControllerProvider.notifier)
                          .fetchFirstPrinciples(question.id);
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (context) =>
                            FirstPrinciplesPanel(questionId: question.id),
                      );
                    },
                    icon: Icon(
                      AppIcons.smartToy,
                      color: context.colors.accent,
                      size: 16.sp,
                    ),
                    label: Text(
                      'AI 第一性原理解读',
                      style: TextStyle(
                        color: context.colors.accent,
                        fontSize: 13.sp,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: context.colors.surface,
                      side: BorderSide(color: context.colors.accent, width: 1),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6.r),
                      ),
                      padding: EdgeInsets.symmetric(vertical: 10.h),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
