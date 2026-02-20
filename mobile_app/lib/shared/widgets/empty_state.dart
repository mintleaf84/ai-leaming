import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 通用空状态组件
///
/// 用于在列表为空时显示引导性内容，支持：
/// - 自定义 Emoji 图标
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
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 32.w),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Emoji 图标
            Text(icon, style: TextStyle(fontSize: 72.sp)),
            SizedBox(height: 24.h),
            // 主标题
            Text(
              title,
              style: TextStyle(
                fontSize: 20.sp,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF37352F),
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 8.h),
            // 副标题
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 14.sp,
                color: Colors.grey[500],
                height: 1.4,
              ),
              textAlign: TextAlign.center,
            ),
            // 行动按钮（如果提供）
            if (actionLabel != null && onAction != null) ...[
              SizedBox(height: 24.h),
              ElevatedButton(
                onPressed: onAction,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF37352F),
                  foregroundColor: Colors.white,
                  padding: EdgeInsets.symmetric(
                    horizontal: 24.w,
                    vertical: 12.h,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8.r),
                  ),
                  elevation: 0,
                ),
                child: Text(
                  actionLabel!,
                  style: TextStyle(
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
