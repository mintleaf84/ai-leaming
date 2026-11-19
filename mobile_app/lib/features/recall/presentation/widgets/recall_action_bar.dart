import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 底部固定操作区。
///
/// 不用 `bottomNavigationBar` 槽位：`Scaffold` 会把那个槽位一起顶到键盘上方，
/// 而这里希望"内容让位、操作留在最下"。所以页面用
/// `Column(Expanded(滚动内容), RecallActionBar)` 配合
/// `resizeToAvoidBottomInset: true`——键盘弹出时只有滚动区变矮，主操作始终可见，
/// 也不会被输入法压住。
class RecallActionBar extends StatelessWidget {
  const RecallActionBar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 10.h),
      child: SafeArea(top: false, child: child),
    );
  }
}

/// 主操作 + 次操作的一行布局。
///
/// 字号放大到 1.2 倍以上就改成上下堆叠：中文按钮文案（「看看对不对」+「全没想起」）
/// 在 360dp 宽 + 1.3 倍字号下并排必然被挤断，此时宁可多占 50dp 高度。
class RecallDualActions extends StatelessWidget {
  const RecallDualActions({
    super.key,
    required this.primary,
    required this.secondary,
  });

  final Widget primary;
  final Widget secondary;

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    if (scale >= 1.2) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          primary,
          SizedBox(height: 2.h),
          secondary,
        ],
      );
    }
    return Row(
      children: [
        Expanded(child: primary),
        SizedBox(width: 8.w),
        secondary,
      ],
    );
  }
}

/// 主操作按钮：满宽、52dp 高，拇指区一次点中。
///
/// 提交中**不放转圈**，只把文案换成「正在记下来…」并禁用：一来转圈会和内容区的
/// 骨架屏抢注意力，二来无限循环动画会让截图/自动化测试永远等不到"静止"。
class RecallPrimaryButton extends StatelessWidget {
  const RecallPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52.h,
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Theme.of(context).colorScheme.primary,
          foregroundColor: Theme.of(context).colorScheme.onPrimary,
          disabledBackgroundColor: Theme.of(
            context,
          ).colorScheme.primary.withValues(alpha: 0.18),
          disabledForegroundColor: Theme.of(
            context,
          ).colorScheme.onSurface.withValues(alpha: 0.5),
          elevation: 0,
          padding: EdgeInsets.symmetric(horizontal: 20.w),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.r),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 17.sp),
              SizedBox(width: 8.w),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 次操作按钮：低调、但仍占满 44dp 触摸区。
class RecallSecondaryButton extends StatelessWidget {
  const RecallSecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        minimumSize: Size(0, 48.h),
        padding: EdgeInsets.symmetric(horizontal: 12.w),
        foregroundColor: scheme.onSurface.withValues(alpha: 0.75),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10.r),
        ),
      ),
      // 字号写在 Text 上、不写进 `styleFrom(textStyle:)`：后者会整份替换按钮的
      // 主题文本样式（连同字族/字距一起丢），在中文界面里表现为字形不一致。
      child: Text(
        label,
        maxLines: 2,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
      ),
    );
  }
}
