import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_theme.dart';

/// 判分结果的语义配色。
///
/// 只从 `AppTheme` 的语义色（成功 / 待补）派生前景、底色、描边三档透明度，
/// 不在这里另写十六进制：色相归主题，界面只决定"多重"。因此深色模式不需要第二套值
/// ——半透明底色叠在 `surface` 上依然分得清层次。
///
/// 刻意**不**把结论文字染成这两个色：12–13sp 的警告橙在浅色底上对比不足，
/// 而且只靠颜色区分对色弱用户不友好。判定靠「图标形状（对勾 / 空圈）+ 底色」表达，
/// 文字一律用 `onSurface`。
class RecallTone {
  final Color foreground;
  final Color background;
  final Color border;

  const RecallTone._({
    required this.foreground,
    required this.background,
    required this.border,
  });

  /// [ok] 为 true 取「已写到」一档，否则取「待补」一档。
  static RecallTone of(BuildContext context, {required bool ok}) {
    final base = ok ? AppTheme.successColor : AppTheme.warningColor;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return RecallTone._(
      foreground: base,
      background: base.withValues(alpha: isDark ? 0.14 : 0.08),
      border: base.withValues(alpha: isDark ? 0.38 : 0.28),
    );
  }

  /// 内容卡片的统一描边（与 `cardTheme` 的 12r 圆角保持同一节奏）。
  static BorderSide cardBorder(BuildContext context) =>
      BorderSide(color: Theme.of(context).dividerColor);

  static BorderRadius get cardRadius => BorderRadius.circular(14.r);
}

/// 数字用等宽数位，换行时不会跳动。
const List<FontFeature> recallTabularFigures = [FontFeature.tabularFigures()];
