import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/agent_question_set.dart';

/// 练习屏的完成态。
///
/// 两种「完成」要分清楚，否则用户会以为刚才白做了：
/// - 本轮做完了若干题 → 报本轮战绩；
/// - 进来时就没有可做的题（之前做完 / 都被标错移出）→ 报「已经做完」。
class AgentSetFinishedView extends StatelessWidget {
  const AgentSetFinishedView({
    super.key,
    required this.set,
    required this.answeredCount,
    required this.correctCount,
    required this.flaggedCount,
    required this.creatingPaper,
    required this.promoting,
    required this.onBackToList,
    required this.onCreatePaper,
    required this.onPromote,
  });

  final AgentQuestionSet? set;
  final int answeredCount;
  final int correctCount;
  final int flaggedCount;
  final bool creatingPaper;
  final bool promoting;
  final VoidCallback onBackToList;
  final VoidCallback onCreatePaper;
  final VoidCallback onPromote;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final didThisRound = answeredCount > 0;
    final current = set;
    final scoreLabel = current?.lastScoreLabel;
    final promoted = current?.isPromoted ?? false;

    return ListView(
      padding: EdgeInsets.fromLTRB(24.w, 32.h, 24.w, 24.h),
      children: [
        Text('✅', style: TextStyle(fontSize: 44.sp)),
        SizedBox(height: 12.h),
        Text(
          didThisRound ? '这套题做完了' : '这套题已经做完了',
          style: TextStyle(
            fontSize: 22.sp,
            fontWeight: FontWeight.bold,
            color: colors.text,
          ),
        ),
        SizedBox(height: 8.h),
        Text(
          didThisRound
              ? '这轮做了 $answeredCount 题，答对 $correctCount 题。'
              : scoreLabel == null
              ? '没有待做的题。想再练的话，可以让 Agent 推一批新的。'
              : '上次成绩 $scoreLabel。想再练的话，可以让 Agent 推一批新的。',
          style: TextStyle(
            fontSize: 14.sp,
            height: 1.6,
            color: colors.textSecondary,
          ),
        ),
        SizedBox(height: 6.h),
        Text(
          flaggedCount > 0
              ? '另有 $flaggedCount 道题标了「有问题」被移出，推题的 Agent 能看到你的理由并修正。'
              : '标了「有问题」的题会立刻移出，推题的 Agent 能看到你的理由并修正。',
          style: TextStyle(
            fontSize: 12.sp,
            height: 1.5,
            color: colors.textSecondary,
          ),
        ),
        SizedBox(height: 28.h),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: const ValueKey<String>('agent_set_finished_paper'),
            onPressed: creatingPaper ? null : onCreatePaper,
            icon: Icon(AppIcons.playCircleOutline, size: 18.sp),
            label: Text(
              creatingPaper ? '正在生成…' : '一键成卷',
              style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w600),
            ),
            style: FilledButton.styleFrom(
              backgroundColor: colors.primary,
              foregroundColor: colors.onPrimary,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10.r),
              ),
            ),
          ),
        ),
        SizedBox(height: 10.h),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const ValueKey<String>('agent_set_finished_promote'),
            onPressed: promoting || promoted ? null : onPromote,
            icon: Icon(AppIcons.checkCircleOutline, size: 18.sp),
            label: Text(
              promoted
                  ? '已转正入库'
                  : promoting
                  ? '正在转正…'
                  : '转正入库',
              style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w600),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: colors.text,
              minimumSize: const Size.fromHeight(48),
              side: BorderSide(color: colors.border),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10.r),
              ),
            ),
          ),
        ),
        SizedBox(height: 10.h),
        SizedBox(
          width: double.infinity,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: TextButton(
              onPressed: onBackToList,
              child: Text(
                '返回题集列表',
                style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
