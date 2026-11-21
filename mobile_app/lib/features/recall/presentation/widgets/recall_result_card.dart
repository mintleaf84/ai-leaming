import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_icons.dart';
import '../../domain/recall_review.dart';
import 'recall_tones.dart';

/// 一次作答的结论块。
///
/// 这是全流程里唯一"回头看"的地方，所以只放用户真正要的两件事：
/// 下次什么时候再见（[RecallReviewResult.nextReviewText]，日期一律由服务端给），
/// 以及明天要不要单独重测那几条。评分、正确率、等级一概不出现。
///
/// 判分屏（底部）与完成屏（正中间）复用同一个块：同一结论在两处应当长得一样。
class RecallResultCard extends StatelessWidget {
  const RecallResultCard({
    super.key,
    required this.result,
    this.pendingItems,
    this.dense = false,
  });

  final RecallReviewResult result;

  /// 明天要重测的条目下标；判分屏取 `result.pendingItems`，完成屏传最后一张的。
  final List<int>? pendingItems;

  /// 判分屏用：内边距与字号收一档，让逐条结果留在一屏内。
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final secondary = scheme.onSurface.withValues(alpha: 0.62);
    final good = result.rating == RecallRating.good;
    final tone = RecallTone.of(context, ok: good);
    final pendingCount = pendingItems?.length ?? 0;
    final text = result.nextReviewText;

    // 服务端的文案有时是「明天只重测这 3 条」，有时是「下次 11 月 20 日」。
    // 下面这行只在「下一句还能补充信息」时才出现——否则同一件事会被说两遍。
    final mentionsRetest = text.contains('重测');
    final String? subline = good
        ? (mentionsRetest ? null : '这张卡答完了。')
        : (pendingCount > 0 && !mentionsRetest
              ? '明天只重测这 $pendingCount 条。'
              : null);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 12.w : 16.w,
        vertical: dense ? 12.h : 16.h,
      ),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(dense ? 12.r : 14.r),
        border: Border.all(color: tone.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.only(top: 1.h),
                child: Icon(
                  good ? AppIcons.checkCircleOutline : AppIcons.eventOutlined,
                  size: (dense ? 16 : 18).sp,
                  color: tone.foreground,
                ),
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  text.isEmpty ? '这次记下了' : text,
                  style: TextStyle(
                    fontSize: (dense ? 14 : 15).sp,
                    height: 1.45,
                    fontWeight: FontWeight.w600,
                    color: scheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 4.h),
          if (subline != null)
            Padding(
              padding: EdgeInsets.only(left: (dense ? 16 : 18).sp + 8.w),
              child: Text(
                subline,
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.5,
                  color: secondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
