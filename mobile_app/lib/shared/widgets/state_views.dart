import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';

/// 全仓统一的「加载失败」与「空列表」两种状态视图（见审计 #9）。
///
/// 为什么合并：这两类状态原来在 6 个屏各写一份，标题字号 16/18 混用、
/// 错误文案有的显示原始异常有的只写"请检查网络"，而且**一处都没有 `Semantics`**
/// ——读屏软件读不出这几块的信息（改之前全仓 116 个 dart 文件里只有 2 处
/// `Semantics(`）。
///
/// 约定：
/// - 颜色一律走 `context.colors`，不在本文件写死色值；
/// - 可点元素命中区 ≥44×44（用的是**逻辑像素常量** 44，不走 ScreenUtil 缩放，
///   否则小屏上会缩到 42 左右）；
/// - 文案由调用方给，本文件不猜业务语义。

/// 加载失败视图：图标 + 标题 + 说明 + 重试（可选一个次要出口）。
class AppErrorView extends StatelessWidget {
  const AppErrorView({
    super.key,
    required this.message,
    required this.onRetry,
    this.title,
    this.secondaryLabel,
    this.onSecondary,
  });

  /// 具体原因/引导，如「请检查网络后重试」或服务端返回的错误摘要。
  final String message;

  /// 重试回调（调用方传 controller 的 load/refresh）。
  final VoidCallback onRetry;

  /// 标题，默认「加载失败」。
  final String? title;

  /// 次要出口的文字（如练习页的「返回首页」）。
  ///
  /// 有些屏（练习页）没有 AppBar，错误态如果不给第二个出口，用户只能靠
  /// 系统返回键；这类屏用这两个字段补回原来的出路。
  final String? secondaryLabel;

  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final resolvedTitle = title ?? '加载失败';

    return Semantics(
      container: true,
      label: '$resolvedTitle。$message',
      child: Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 32.w, vertical: 24.h),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(AppIcons.errorOutline, size: 48.sp, color: colors.error),
              SizedBox(height: 16.h),
              Text(
                resolvedTitle,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.w600,
                  color: colors.text,
                ),
              ),
              SizedBox(height: 8.h),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
              ),
              SizedBox(height: 24.h),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: Icon(AppIcons.refresh, size: 18.sp),
                label: Text('重试', style: TextStyle(fontSize: 14.sp)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.accent,
                  foregroundColor: colors.onAccent,
                  // 命中区 ≥44×44
                  minimumSize: const Size(96, 44),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8.r),
                  ),
                ),
              ),
              if (secondaryLabel != null && onSecondary != null) ...[
                SizedBox(height: 4.h),
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: 44,
                    minWidth: 44,
                  ),
                  child: TextButton(
                    onPressed: onSecondary,
                    style: TextButton.styleFrom(
                      foregroundColor: colors.textSecondary,
                    ),
                    child: Text(
                      secondaryLabel!,
                      style: TextStyle(fontSize: 14.sp),
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

/// 空列表视图：可选表情图标 + 标题 + 说明 + 可选行动按钮。
class AppEmptyView extends StatelessWidget {
  const AppEmptyView({
    super.key,
    required this.title,
    this.hint,
    this.actionLabel,
    this.onAction,
    this.emoji,
  });

  /// 主标题，如「暂无教材」。
  final String title;

  /// 补充说明，如「请联系管理员上传教材」。
  final String? hint;

  /// 行动按钮文字（给了 [actionLabel] 才渲染）。
  final String? actionLabel;

  final VoidCallback? onAction;

  /// 可选的表情图标（64sp）。
  ///
  /// 保留这个字段是为了**不改观感**：替换前的空状态都带一个 64sp 表情，
  /// 去掉会只剩两行光秃秃的文字。传 null 就是纯文字版。
  final String? emoji;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final semanticLabel = hint == null ? title : '$title。$hint';

    return Semantics(
      container: true,
      label: semanticLabel,
      child: Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 32.w, vertical: 24.h),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (emoji != null) ...[
                Text(emoji!, style: TextStyle(fontSize: 64.sp)),
                SizedBox(height: 16.h),
              ],
              Text(
                title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.bold,
                  color: colors.text,
                ),
              ),
              if (hint != null) ...[
                SizedBox(height: 8.h),
                Text(
                  hint!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: colors.textSecondary,
                  ),
                ),
              ],
              if (actionLabel != null && onAction != null) ...[
                SizedBox(height: 24.h),
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: 44,
                    minWidth: 44,
                  ),
                  child: TextButton(
                    onPressed: onAction,
                    style: TextButton.styleFrom(foregroundColor: colors.text),
                    child: Text(
                      actionLabel!,
                      style: TextStyle(fontSize: 14.sp),
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
