import 'package:flutter/material.dart';

import 'state_views.dart';

/// 通用空状态组件（`AppEmptyView` 的薄壳，保留原调用点签名）。
///
/// 为什么只剩一层壳：空态原来有三套实现——本文件的 80sp 表情 + `titleLarge`、
/// `AppEmptyView` 的 64sp + 18sp 粗体、以及历史详情页手写的一版 48sp。
/// 三套都没有 `Semantics`，字号和间距也各不相同。现在统一由 `AppEmptyView`
/// 渲染（有 `Semantics`、图标 64sp、标题 18sp 粗体 + 14sp 说明），
/// 本类只负责把旧参数名映射过去，调用方一行不用改。
///
/// 观感差异仅有：表情 80sp → 64sp、标题改用 18sp 粗体、入场悬浮动画去掉
/// （与全仓其它空态保持一致，避免同一屏两个空态一个动一个静）。
class EmptyState extends StatelessWidget {
  /// Emoji 图标，如 '📚'、'🧠'（映射到 `AppEmptyView.emoji`）。
  final String icon;

  /// 主标题文字
  final String title;

  /// 副标题/描述文字（映射到 `AppEmptyView.hint`）
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
    return AppEmptyView(
      emoji: icon,
      title: title,
      hint: subtitle,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }
}
