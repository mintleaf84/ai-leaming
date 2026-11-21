import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 操作失败的就地提示条（报错 / 成卷 / 转正失败）。
///
/// 不用 SnackBar：SnackBar 会盖住底部操作区，而这三种失败都发生在底部按钮
/// 上——用户刚点完就在原地看到原因，才不需要去找刚才那条一闪而过的提示。
class AgentSetErrorBanner extends StatelessWidget {
  const AgentSetErrorBanner({super.key, required this.message, this.onDismiss});

  final String message;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      margin: EdgeInsets.fromLTRB(16.w, 0, 16.w, 8.h),
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: colors.errorContainer,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: colors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(AppIcons.errorOutline, size: 16.sp, color: colors.error),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13.sp,
                height: 1.4,
                color: colors.error,
              ),
            ),
          ),
          if (onDismiss != null)
            ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
              child: TextButton(
                onPressed: onDismiss,
                style: TextButton.styleFrom(
                  foregroundColor: colors.error,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('知道了'),
              ),
            ),
        ],
      ),
    );
  }
}
