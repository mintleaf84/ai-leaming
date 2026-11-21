import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'recall_tones.dart';

/// 回忆流程里所有「一张纸」的统一外壳。
///
/// 四个屏（今天、作答、判分、完成）用的是同一块面板：`cardColor` + 14r 圆角 +
/// 1px 分隔色描边。抽出来是为了让圆角、描边和内边距不可能各写一套——
/// 这类不一致在小屏上最容易被看成"没对齐"。
class RecallCardShell extends StatelessWidget {
  const RecallCardShell({super.key, required this.child, this.padding});

  final Widget child;

  /// 不传则用默认的 16/14 内边距。
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: padding ?? EdgeInsets.fromLTRB(16.w, 14.h, 16.w, 16.h),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: RecallTone.cardRadius,
        border: Border.fromBorderSide(RecallTone.cardBorder(context)),
      ),
      child: child,
    );
  }
}

/// 单块内容屏（今天 / 完成 / 空态 / 错误）的垂直构图。
///
/// 这四屏都只有一块内容，如果直接顶对齐，下方会剩一大片没有张力的空白，
/// 看起来像"内容没加载完"。所以让内容在可用高度里居中，同时保留滚动：
/// 字号放大或横屏时内容仍可滚动，不会顶出边界。
///
/// 实现就是 `ConstrainedBox(minHeight)` + `Column(center)`：`Column` 在无界高度下
/// 取 `max(minHeight, 内容高)`，居中分发就自然成立（不需要 `IntrinsicHeight`）。
class RecallCenteredBlock extends StatelessWidget {
  const RecallCenteredBlock({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(16, 16, 16, 24),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 0.0;
        final inset = EdgeInsets.fromLTRB(
          padding.left.w,
          padding.top.h,
          padding.right.w,
          padding.bottom.h,
        );
        return SingleChildScrollView(
          padding: inset,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: (available - inset.vertical).clamp(
                0.0,
                double.infinity,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [child],
            ),
          ),
        );
      },
    );
  }
}
