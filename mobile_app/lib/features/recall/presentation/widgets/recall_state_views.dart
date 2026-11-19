import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_icons.dart';
import 'recall_layout.dart';
import 'recall_tones.dart';

/// 空队列屏：今天确实没有到期卡 / 新卡。
///
/// 与错误态严格区分：只有队列真拿到、且编号列表为空才走到这里。
/// 「有卡却拿不到编号」由状态机判成错误态——否则用户会以为今天已经做完。
///
/// 没有复用 `shared/widgets/empty_state.dart`：那个组件是「居中 + 单个 CTA」的形态，
/// 塞不下连续天数这一行，也没有滚动兜底，字号放到 1.3 倍时在矮屏上会顶出边界。
class RecallEmptyView extends StatelessWidget {
  const RecallEmptyView({
    super.key,
    required this.streakDays,
    required this.onRefresh,
  });

  final int streakDays;
  final VoidCallback onRefresh;

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
          Text('📭', style: TextStyle(fontSize: 52.sp, height: 1)),
          SizedBox(height: 20.h),
          Text(
            '今天没有要复习的卡片',
            style: TextStyle(
              fontSize: 19.sp,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface,
              letterSpacing: -0.2,
            ),
          ),
          SizedBox(height: 10.h),
          Text(
            '到期的卡和新卡会在明早重新排一次。',
            style: TextStyle(fontSize: 13.sp, height: 1.7, color: secondary),
          ),
          if (streakDays > 0) ...[
            SizedBox(height: 6.h),
            Text(
              '已经连续 $streakDays 天。',
              style: TextStyle(
                fontSize: 13.sp,
                height: 1.7,
                color: secondary,
                fontFeatures: recallTabularFigures,
              ),
            ),
          ],
          SizedBox(height: 28.h),
          SizedBox(
            height: 44.h,
            child: OutlinedButton.icon(
              onPressed: onRefresh,
              icon: Icon(AppIcons.refresh, size: 16.sp),
              label: Text('再拉一次', style: TextStyle(fontSize: 14.sp)),
              style: OutlinedButton.styleFrom(
                foregroundColor: scheme.onSurface,
                side: BorderSide(color: theme.dividerColor),
                padding: EdgeInsets.symmetric(horizontal: 18.w),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10.r),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 加载失败屏：给出可读原因 + 重试。
///
/// 原因来自 [describeRecallError]（超时 / 连不上 / 401 / 5xx 各有各的说法），
/// 而不是一句「加载失败」——那句话等于把排查成本全推给用户。
class RecallErrorView extends StatelessWidget {
  const RecallErrorView({
    super.key,
    required this.message,
    required this.onRetry,
    this.onBack,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback? onBack;

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
          Icon(
            AppIcons.cloudOffOutlined,
            size: 40.sp,
            color: scheme.onSurface.withValues(alpha: 0.32),
          ),
          SizedBox(height: 20.h),
          Text(
            '回忆没有加载出来',
            style: TextStyle(
              fontSize: 19.sp,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface,
              letterSpacing: -0.2,
            ),
          ),
          SizedBox(height: 10.h),
          Text(
            message,
            style: TextStyle(fontSize: 13.sp, height: 1.7, color: secondary),
          ),
          SizedBox(height: 28.h),
          SizedBox(
            height: 48.h,
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onRetry,
              style: ElevatedButton.styleFrom(
                backgroundColor: scheme.primary,
                foregroundColor: scheme.onPrimary,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12.r),
                ),
              ),
              child: Text(
                '重试',
                style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          if (onBack != null) ...[
            SizedBox(height: 4.h),
            Center(
              child: TextButton(
                onPressed: onBack,
                style: TextButton.styleFrom(
                  minimumSize: Size(0, 44.h),
                  foregroundColor: secondary,
                ),
                child: Text('先回去', style: TextStyle(fontSize: 13.sp)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 加载骨架：形状照着作答屏排（一行来源 + 题干 + 输入框）。
///
/// 刻意**不做**转圈遮罩，也不做无限循环的呼吸动画：骨架静止即可，
/// 一是用户能立刻看到"这屏大概长什么样"，二是无限动画会让截图与自动化测试
/// 永远等不到静止帧。
class RecallSkeleton extends StatelessWidget {
  const RecallSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final barColor = Theme.of(
      context,
    ).colorScheme.onSurface.withValues(alpha: 0.06);

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 16.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Bar(width: 116.w, height: 12.h, color: barColor),
              const Spacer(),
              _Bar(width: 52.w, height: 12.h, color: barColor),
            ],
          ),
          SizedBox(height: 12.h),
          _Bar(width: double.infinity, height: 4.h, color: barColor),
          SizedBox(height: 20.h),
          Container(
            padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 16.h),
            decoration: BoxDecoration(
              color: theme.cardColor,
              borderRadius: RecallTone.cardRadius,
              border: Border.fromBorderSide(RecallTone.cardBorder(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Bar(width: 88.w, height: 11.h, color: barColor),
                SizedBox(height: 18.h),
                _Bar(width: double.infinity, height: 16.h, color: barColor),
                SizedBox(height: 8.h),
                _Bar(width: 220.w, height: 16.h, color: barColor),
                SizedBox(height: 20.h),
                Container(
                  height: 128.h,
                  decoration: BoxDecoration(
                    color: barColor,
                    borderRadius: BorderRadius.circular(12.r),
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

class _Bar extends StatelessWidget {
  const _Bar({required this.width, required this.height, required this.color});

  final double width;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4.r),
      ),
    );
  }
}
