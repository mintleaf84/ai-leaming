import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';

/// 「这题有问题」的二次确认。
///
/// 返回：`null` = 取消；`''` = 确认但没填原因；非空字符串 = 确认并带原因。
/// 用三态而不是 `bool`：原因要原样回传给服务端（Agent 靠它修正下一批），
/// 而「没填原因」与「取消」在业务上是两件事。
Future<String?> showAgentSetFlagDialog(BuildContext context) {
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => const _AgentSetFlagDialog(),
  );
}

class _AgentSetFlagDialog extends StatefulWidget {
  const _AgentSetFlagDialog();

  @override
  State<_AgentSetFlagDialog> createState() => _AgentSetFlagDialogState();
}

class _AgentSetFlagDialogState extends State<_AgentSetFlagDialog> {
  final TextEditingController _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        '这题有什么问题？',
        style: TextStyle(fontSize: 17.sp, fontWeight: FontWeight.bold),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '确认后这题会立刻从这套题里移出，并告诉推题的 Agent 去修正。'
            '已经做过的记录不会丢。',
            style: TextStyle(
              fontSize: 13.sp,
              height: 1.5,
              color: colors.textSecondary,
            ),
          ),
          SizedBox(height: 12.h),
          TextField(
            key: const ValueKey<String>('agent_set_flag_reason'),
            controller: _reason,
            maxLines: 3,
            minLines: 1,
            maxLength: 200,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              hintText: '哪里不对？（可不填，例如「答案有误」「题干缺条件」）',
              hintStyle: TextStyle(
                fontSize: 13.sp,
                color: colors.textSecondary,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8.r),
              ),
              counterStyle: TextStyle(
                fontSize: 11.sp,
                color: colors.textSecondary,
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            '取消',
            style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
          ),
        ),
        FilledButton(
          key: const ValueKey<String>('agent_set_flag_confirm'),
          onPressed: () => Navigator.of(context).pop(_reason.text.trim()),
          style: FilledButton.styleFrom(
            backgroundColor: colors.error,
            foregroundColor: colors.onError,
            minimumSize: const Size(88, 44),
          ),
          child: Text(
            '移出这道题',
            style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

/// 「一键成卷」确认。
Future<bool> showAgentSetPaperConfirm(
  BuildContext context, {
  required int remaining,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => _ConfirmDialog(
      title: '把剩下的题组成一张卷？',
      message:
          '会把这套题里还没出错的 $remaining 道题组成一张试卷，'
          '可以按试卷的方式限时做完，交卷后统一看成绩。',
      confirmKey: const ValueKey<String>('agent_set_paper_confirm'),
      confirmLabel: '生成试卷',
    ),
  );
  return confirmed ?? false;
}

/// 「转正入库」确认。
Future<bool> showAgentSetPromoteConfirm(
  BuildContext context, {
  required int count,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => _ConfirmDialog(
      title: '把题转进题库？',
      message:
          '转正后这 $count 道题会进入题库，之后会算进掌握度和自动组卷。'
          '这套题本身仍然可以留着回看。',
      confirmKey: const ValueKey<String>('agent_set_promote_confirm'),
      confirmLabel: '转正入库',
    ),
  );
  return confirmed ?? false;
}

class _ConfirmDialog extends StatelessWidget {
  const _ConfirmDialog({
    required this.title,
    required this.message,
    required this.confirmKey,
    required this.confirmLabel,
  });

  final String title;
  final String message;
  final Key confirmKey;
  final String confirmLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        title,
        style: TextStyle(fontSize: 17.sp, fontWeight: FontWeight.bold),
      ),
      content: Text(
        message,
        style: TextStyle(
          fontSize: 13.sp,
          height: 1.5,
          color: colors.textSecondary,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(
            '再想想',
            style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
          ),
        ),
        FilledButton(
          key: confirmKey,
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(
            backgroundColor: colors.primary,
            foregroundColor: colors.onPrimary,
            minimumSize: const Size(88, 44),
          ),
          child: Text(
            confirmLabel,
            style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
