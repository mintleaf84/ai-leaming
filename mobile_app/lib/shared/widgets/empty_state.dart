import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../core/theme/app_theme.dart';

/// 通用空状态组件
///
/// 用于在列表为空时显示引导性内容，支持：
/// - 自定义 Emoji 图标 (带轻微悬浮动画)
/// - 主标题和副标题
/// - 可选的行动按钮 (CTA)
class EmptyState extends StatelessWidget {
  /// Emoji 图标，如 '📚'、'🧠'
  final String icon;

  /// 主标题文字
  final String title;

  /// 副标题/描述文字
  final String subtitle;

  /// 行动按钮文字（可选）
  final String? actionLabel;

  /// 行动按钮回调（可选）
  final VoidCallback? onAction;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - value)),
            child: child,
          ),
        );
      },
      child: Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 48.w),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Emoji 图标 (可考虑加入悬浮动画)
              Text(
                icon,
                style: TextStyle(fontSize: 80.sp, height: 1.0),
              ),
              SizedBox(height: 32.h),
              // 主标题
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 12.h),
              // 副标题
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.secondaryTextColor,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
              // 行动按钮（如果提供）
              if (actionLabel != null && onAction != null) ...[
                SizedBox(height: 40.h),
                SizedBox(
                  width: double.infinity,
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 24.w),
                    child: ElevatedButton(
                      onPressed: onAction,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Theme.of(context).colorScheme.onPrimary,
                        padding: EdgeInsets.symmetric(vertical: 16.h),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12.r),
                        ),
                        elevation: 0,
                      ),
                      child: Text(
                        actionLabel!,
                        style: TextStyle(
                          fontSize: 15.sp,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
