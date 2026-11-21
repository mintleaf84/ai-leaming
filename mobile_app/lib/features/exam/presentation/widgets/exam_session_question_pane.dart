import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/exam_question.dart';
import 'exam_question_view.dart';
import 'exam_session_bottom_bar.dart';
import 'exam_session_progress.dart';

/// 作答中的整屏：进度 + 当前题目（可滚动）+ 底部动作栏。
class ExamSessionQuestionPane extends StatelessWidget {
  const ExamSessionQuestionPane({
    super.key,
    required this.colors,
    required this.index,
    required this.total,
    required this.answeredCount,
    required this.question,
    required this.selected,
    required this.scrollController,
    required this.submitting,
    required this.submitError,
    required this.editingLocked,
    required this.onSelectOption,
    required this.onTyped,
    required this.onGoTo,
    required this.onOpenAnswerSheet,
    required this.onConfirmSubmit,
  });

  /// 当前题序号（从 0 开始）。
  final int index;
  final int total;
  final int answeredCount;
  final ExamQuestion question;

  /// 当前题已选/已填的答案（空串表示未作答）。
  final String selected;
  final ScrollController scrollController;
  final bool submitting;
  final String? submitError;
  final bool editingLocked;
  final AppColors colors;
  final void Function(ExamQuestion question, String label) onSelectOption;
  final void Function(ExamQuestion question, String value) onTyped;
  final ValueChanged<int> onGoTo;
  final VoidCallback onOpenAnswerSheet;
  final VoidCallback onConfirmSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ExamSessionProgress(
          colors: colors,
          index: index,
          total: total,
          answeredCount: answeredCount,
        ),
        Expanded(
          child: SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 24.h),
            child: ExamQuestionView(
              key: ValueKey<int>(question.id),
              question: question,
              position: index + 1,
              selected: selected,
              onSelectOption: (label) => onSelectOption(question, label),
              onTyped: (value) => onTyped(question, value),
            ),
          ),
        ),
        ExamSessionBottomBar(
          colors: colors,
          isLast: index >= total - 1,
          submitting: submitting,
          submitError: submitError,
          editingLocked: editingLocked,
          onPrev: index > 0 ? () => onGoTo(index - 1) : null,
          onNext: () => onGoTo(index + 1),
          onOpenAnswerSheet: onOpenAnswerSheet,
          onConfirmSubmit: onConfirmSubmit,
        ),
      ],
    );
  }
}
