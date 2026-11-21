import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/widgets/animated_option_card.dart';
import '../../../practice/presentation/widgets/question_material_card.dart';
import '../../domain/agent_judge.dart';
import '../../domain/agent_question.dart';

/// 题集里的一道题：题型 + 「这题有问题」+ 材料 + 题干 + 选项。
///
/// 选项卡片直接复用练习页的 [AnimatedOptionCard]（选中态、点按缩放、读屏语义
/// 全在那边调过），材料卡复用 [QuestionMaterialCard]——材料渲染涉及 HTML 白名单
/// 与折叠计量，重写一份必然与练习页出现两套观感。
class AgentSetQuestionView extends StatelessWidget {
  const AgentSetQuestionView({
    super.key,
    required this.question,
    required this.selected,
    required this.outcome,
    required this.submitting,
    required this.flagging,
    required this.onSelect,
    required this.onFlag,
  });

  final AgentQuestion question;
  final Set<String> selected;
  final AgentJudgeOutcome? outcome;
  final bool submitting;
  final bool flagging;
  final ValueChanged<String> onSelect;
  final VoidCallback onFlag;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final judged = outcome != null;
    final correctLetters = outcome?.correctOptionLetters ?? const <String>{};
    final options = question.displayOptions;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20.w, 4.h, 20.w, 24.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.h),
                decoration: BoxDecoration(
                  color: colors.accentContainer,
                  borderRadius: BorderRadius.circular(4.r),
                ),
                child: Text(
                  question.typeLabel,
                  style: TextStyle(
                    fontSize: 12.sp,
                    fontWeight: FontWeight.w600,
                    color: colors.accent,
                  ),
                ),
              ),
              const Spacer(),
              // 右上角常驻：题一出来就能报，而不是做完了才想起这题有问题。
              // 触控区补到 44×44（TextButton 默认高度约 36）。
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
                child: TextButton.icon(
                  key: const ValueKey<String>('agent_set_flag_button'),
                  onPressed: flagging || submitting ? null : onFlag,
                  icon: Icon(
                    AppIcons.flagOutlined,
                    size: 15.sp,
                    color: colors.textSecondary,
                  ),
                  label: Text(
                    flagging ? '正在移出…' : '这题有问题',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.symmetric(horizontal: 8.w),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 12.h),
          QuestionMaterialCard(
            material: question.material,
            materialHtml: question.materialHtml,
          ),
          Text(
            question.content,
            style: TextStyle(
              fontSize: 20.sp,
              fontWeight: FontWeight.w600,
              height: 1.45,
              color: colors.text,
            ),
          ),
          SizedBox(height: 24.h),
          for (var index = 0; index < options.length; index++)
            _buildOption(
              context,
              label: AgentQuestion.labelAt(index),
              text: options[index],
              judged: judged,
              correctLetters: correctLetters,
            ),
          if (options.isEmpty) ...[
            // 没有选项的题（选择题不该走到这里）：说清楚「这题没法点」，
            // 而不是给一个空白的作答区让人猜是不是加载失败。
            Text(
              '这道题没有选项，暂时不能在这里作答。可以标「这题有问题」让 Agent 重推。',
              style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOption(
    BuildContext context, {
    required String label,
    required String text,
    required bool judged,
    required Set<String> correctLetters,
  }) {
    final isSelected = selected.contains(label);
    final isCorrectOption = correctLetters.contains(label);
    return AnimatedOptionCard(
      label: label,
      text: text,
      isSelected: isSelected,
      isMultiSelect: question.isMulti,
      isCorrect: judged && isSelected && isCorrectOption,
      isWrong: judged && isSelected && !isCorrectOption,
      showCorrectHint: judged && !isSelected && isCorrectOption,
      onTap: judged || submitting ? null : () => onSelect(label),
    );
  }
}

/// 判分结果条：对/错 + 正确答案。
///
/// 不展示解析：题集接口按契约**不含答案与解析**，判分响应也只有对错与正确答案。
/// 编一段解析出来比不给更糟——用户会把编的内容当权威。
class AgentSetJudgePanel extends StatelessWidget {
  const AgentSetJudgePanel({super.key, required this.outcome});

  final AgentJudgeOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final correct = outcome.isCorrect;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 10.h),
      decoration: BoxDecoration(
        color: correct ? colors.successContainer : colors.errorContainer,
        border: Border(
          top: BorderSide(
            color: correct ? colors.success : colors.error,
            width: 0.5,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                correct ? AppIcons.checkCircle : AppIcons.cancelSolid,
                size: 18.sp,
                color: correct ? colors.success : colors.error,
              ),
              SizedBox(width: 6.w),
              Text(
                correct ? '答对了' : '答错了',
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w700,
                  color: correct ? colors.success : colors.error,
                ),
              ),
              SizedBox(width: 10.w),
              Flexible(
                child: Text(
                  '正确答案：${outcome.correctAnswerLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                  ),
                ),
              ),
            ],
          ),
          if (outcome.offline) ...[
            SizedBox(height: 4.h),
            Text(
              '这次判分是在本地做的（断网），联网后补交。',
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
