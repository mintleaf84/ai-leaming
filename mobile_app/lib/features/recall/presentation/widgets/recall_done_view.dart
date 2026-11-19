import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../domain/recall_review.dart';
import 'recall_layout.dart';
import 'recall_result_card.dart';
import 'recall_tones.dart';

/// 完成屏：今天的队列都答完了。
///
/// 最后一张的结论仍然完整展示（复用判分屏那块），因为「下次 11 月 20 日」
/// 是他今天唯一带走的信息。连续天数只在服务端给了正数时才出现——
/// 客户端算不出学习日（04:00）切换后的连续天数，编一个数字比不显示更糟。
class RecallDoneView extends StatelessWidget {
  const RecallDoneView({
    super.key,
    required this.result,
    required this.note,
    required this.pendingItems,
    required this.streakDays,
  });

  final RecallReviewResult? result;

  /// 最后一张卡的结论文案（没有完整 result 时的兜底）。
  final String? note;

  /// 最后一张卡要重测的条目下标。
  final List<int>? pendingItems;

  final int streakDays;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final secondary = scheme.onSurface.withValues(alpha: 0.6);

    return RecallCenteredBlock(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('✅', style: TextStyle(fontSize: 44.sp, height: 1)),
          SizedBox(height: 18.h),
          Text(
            '今天的回忆做完了',
            style: TextStyle(
              fontSize: 20.sp,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
              color: scheme.onSurface,
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            '这些卡已经排到明天之后，明天再来就好。',
            style: TextStyle(fontSize: 13.sp, height: 1.7, color: secondary),
          ),
          SizedBox(height: 20.h),
          if (result != null)
            RecallResultCard(result: result!, pendingItems: pendingItems)
          else if (note != null && note!.isNotEmpty)
            Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),
              decoration: BoxDecoration(
                color: theme.cardColor,
                borderRadius: RecallTone.cardRadius,
                border: Border.fromBorderSide(RecallTone.cardBorder(context)),
              ),
              child: Text(
                note!,
                style: TextStyle(
                  fontSize: 15.sp,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                  color: scheme.onSurface,
                ),
              ),
            ),
          if (streakDays > 0) ...[
            SizedBox(height: 14.h),
            Text(
              '已经连续 $streakDays 天。',
              style: TextStyle(
                fontSize: 12.sp,
                height: 1.6,
                color: secondary,
                fontFeatures: recallTabularFigures,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
