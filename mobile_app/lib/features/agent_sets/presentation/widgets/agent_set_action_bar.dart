import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 练习屏底部操作区：
///
/// - 主按钮：判分 → 下一题 → 完成（一条按钮走完，避免「三个平级大按钮」）；
/// - 次入口：「一键成卷」「转正入库」——它们是**离开这道题**的动作，
///   放在主按钮下方并用文字按钮，误触代价低（两者都有二次确认）。
class AgentSetActionBar extends StatelessWidget {
  const AgentSetActionBar({
    super.key,
    required this.judged,
    required this.isLastQuestion,
    required this.canSubmit,
    required this.submitting,
    required this.creatingPaper,
    required this.promoting,
    required this.promoted,
    required this.remaining,
    required this.onPrimary,
    required this.onCreatePaper,
    required this.onPromote,
  });

  final bool judged;
  final bool isLastQuestion;
  final bool canSubmit;
  final bool submitting;
  final bool creatingPaper;
  final bool promoting;
  final bool promoted;
  final int remaining;
  final VoidCallback onPrimary;
  final VoidCallback onCreatePaper;
  final VoidCallback onPromote;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final String primaryLabel;
    if (submitting) {
      primaryLabel = '正在判分…';
    } else if (judged) {
      primaryLabel = isLastQuestion ? '完成这套题' : '下一题';
    } else {
      primaryLabel = '判分';
    }
    final primaryEnabled = judged || canSubmit;

    return Container(
      padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 12.h),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    key: const ValueKey<String>('agent_set_paper_button'),
                    onPressed: creatingPaper || remaining == 0
                        ? null
                        : onCreatePaper,
                    icon: Icon(
                      AppIcons.playCircleOutline,
                      size: 16.sp,
                      color: colors.textSecondary,
                    ),
                    label: Text(
                      creatingPaper ? '正在生成…' : '一键成卷',
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: TextButton.icon(
                    key: const ValueKey<String>('agent_set_promote_button'),
                    onPressed: promoting || promoted ? null : onPromote,
                    icon: Icon(
                      AppIcons.checkCircleOutline,
                      size: 16.sp,
                      color: colors.textSecondary,
                    ),
                    label: Text(
                      promoted
                          ? '已转正'
                          : promoting
                          ? '正在转正…'
                          : '转正入库',
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: 4.h),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const ValueKey<String>('agent_set_primary_button'),
                onPressed: primaryEnabled && !submitting ? onPrimary : null,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: colors.onPrimary,
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                child: Text(
                  primaryLabel,
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
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
