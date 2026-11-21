import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'recall_layout.dart';
import 'recall_tones.dart';

/// 「今天」屏：进卡之前先给一眼总量。
///
/// 手机上先摊开「多少张、几分钟、到期几张、新几张」再进卡，比冷启动直接怼一张卡
/// 更不容易误触——用户能先决定"现在有没有 9 分钟"。
class RecallQueueReadyView extends StatelessWidget {
  const RecallQueueReadyView({
    super.key,
    required this.total,
    required this.due,
    required this.fresh,
    required this.estimatedMinutes,
    required this.streakDays,
    required this.doneCount,
  });

  final int total;
  final int due;
  final int fresh;
  final int estimatedMinutes;
  final int streakDays;
  final int doneCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final secondary = scheme.onSurface.withValues(alpha: 0.6);

    return RecallCenteredBlock(
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: 1),
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 12 * (1 - value)),
            child: child,
          ),
        ),
        child: RecallCardShell(
          padding: EdgeInsets.fromLTRB(20.w, 18.h, 20.w, 20.h),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      doneCount > 0 ? '接着做' : '今天',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.sp,
                        letterSpacing: 2,
                        color: secondary,
                      ),
                    ),
                  ),
                  if (streakDays > 0)
                    Text(
                      '连续 $streakDays 天',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.sp,
                        color: secondary,
                        fontFeatures: recallTabularFigures,
                      ),
                    ),
                ],
              ),
              SizedBox(height: 14.h),
              // 核心数字：一眼看出今天的量
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '$total',
                    style: TextStyle(
                      fontSize: 46.sp,
                      height: 1.1,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -1.5,
                      color: scheme.onSurface,
                      fontFeatures: recallTabularFigures,
                    ),
                  ),
                  SizedBox(width: 6.w),
                  Text(
                    '张卡',
                    style: TextStyle(fontSize: 15.sp, color: secondary),
                  ),
                ],
              ),
              SizedBox(height: 4.h),
              Text(
                estimatedMinutes > 0 ? '约 $estimatedMinutes 分钟' : '几分钟就好',
                style: TextStyle(
                  fontSize: 13.sp,
                  color: secondary,
                  fontFeatures: recallTabularFigures,
                ),
              ),
              SizedBox(height: 18.h),
              Row(
                children: [
                  Expanded(
                    child: _StatTile(label: '到期', value: due, urgent: true),
                  ),
                  SizedBox(width: 10.w),
                  Expanded(
                    child: _StatTile(label: '新卡', value: fresh),
                  ),
                ],
              ),
              SizedBox(height: 16.h),
              Text(
                // 手动断成两行：让这两句各自完整，而不是随屏宽切出一个孤字
                '先写下记得的，再对照答案。\n想不起来的，明天单独重测。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.6,
                  color: secondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 一个计数小块。
class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    this.urgent = false,
  });

  final String label;
  final int value;

  /// 到期卡用强调色：它是"今天必须处理"的那部分。
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: scheme.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12.sp,
              color: scheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          SizedBox(height: 2.h),
          Text(
            '$value',
            style: TextStyle(
              fontSize: 19.sp,
              fontWeight: FontWeight.w600,
              color: urgent ? scheme.secondary : scheme.onSurface,
              fontFeatures: recallTabularFigures,
            ),
          ),
        ],
      ),
    );
  }
}
