import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// 交卷确认：还没答的先说清有几道（未作答按错计分）。
class ExamSubmitConfirmDialog extends StatelessWidget {
  const ExamSubmitConfirmDialog({super.key, required this.unanswered});

  final int unanswered;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('确认交卷'),
      content: Text(
        unanswered > 0
            ? '还有 $unanswered 道题没作答，未作答会按错计入成绩。交卷后不能修改。'
            : '全部答完了。交卷后不能修改，确定交卷吗？',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('再检查一下'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('交卷'),
        ),
      ],
    );
  }
}

/// 超时自动交卷失败：说明答案还在，可重试（不自动反复重试）。
class ExamAutoSubmitFailureDialog extends StatelessWidget {
  const ExamAutoSubmitFailureDialog({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('时间到了'),
      content: Text('自动交卷没有成功：$message\n可以点「重试」再交一次；不交也不会丢答案，但这场不会计入成绩。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('稍后'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('重试'),
        ),
      ],
    );
  }
}

/// 离开作答确认：没交卷的离开不计分。
class ExamLeaveConfirmDialog extends StatelessWidget {
  const ExamLeaveConfirmDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('离开作答？'),
      content: const Text('这次作答还没交卷，离开后不会计分，也不会进练习历史。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('继续作答'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: context.colors.error),
          child: const Text('离开'),
        ),
      ],
    );
  }
}
