import 'package:flutter/material.dart';

/// 应用语义色层（见 docs/ui-audit-2026-11-20.md 的 P0-1）。
///
/// 为什么要有这一层：`AppTheme` 里的颜色常量是 `static const`，页面拿不到，
/// 于是 20 个屏各自写死 `Color(0xFFF7F7F5)` 当页面底、`Colors.white` 当 AppBar 底，
/// 结果「设置里切暗色」只有 4 个屏真的变黑。
///
/// 用法：`context.colors.surface` / `context.colors.text`。
/// **页面里禁止再写死这些色**：
/// - 基底：surface / background / surfaceAlt / border / text / textSecondary
/// - 品牌：primary（深底及其前景 onPrimary）、accent（品牌蓝及浅底 accentContainer，
///   实底前景 onAccent）
/// - 状态：success / error / warning 及其浅底 *Container，实底上的前景 onSuccess / onError
/// 也不要在页面里判断 `Theme.of(context).brightness` —— 需要什么色就问这一层要。
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.border,
    required this.text,
    required this.textSecondary,
    required this.primary,
    required this.onPrimary,
    required this.accent,
    required this.onAccent,
    required this.accentContainer,
    required this.success,
    required this.successContainer,
    required this.onSuccess,
    required this.error,
    required this.errorContainer,
    required this.onError,
    required this.warning,
    required this.warningContainer,
  });

  /// 页面底色（Scaffold / 大区块背景）
  final Color background;

  /// 卡片 / 顶栏 / 输入框等"抬起来"的表面
  final Color surface;

  /// 比 surface 再低一层的填充（灰底区块、未选中项）
  final Color surfaceAlt;

  /// 描边 / 分割线
  final Color border;

  /// 正文主色
  final Color text;

  /// 次要文字、说明、占位
  final Color textSecondary;

  /// 品牌深底：主按钮、选中 tab、进度条、FAB、头像底
  final Color primary;

  /// 品牌深底上的前景（图标 / 文字）
  final Color onPrimary;

  /// 品牌强调色：链接、光标、滑块、可交互图标
  final Color accent;

  /// accent 实底上的前景（按钮文字 / 进度环 / 勾选标记）。
  ///
  /// 亮色下 accent 是深蓝 `#135BEC`，白字对比度 5.8:1；暗色下 accent 是浅蓝
  /// `#7AA7FF`，白字只有 2.1:1（远低于 4.5:1），所以暗色改用近黑底色，
  /// 对比度约 10:1。**不要**再在 accent 实底上写 `Colors.white`。
  final Color onAccent;

  /// 品牌强调色的浅底（选中行、标签底）
  final Color accentContainer;

  /// 语义状态色：正确
  final Color success;

  /// 语义状态色的浅底（用来垫图标/徽标）
  final Color successContainer;

  /// success 实底上的前景（白字/白勾）
  final Color onSuccess;

  /// 语义状态色：错误
  final Color error;

  /// 语义状态色的浅底
  final Color errorContainer;

  /// error 实底上的前景
  final Color onError;

  /// 语义状态色：警告/提示
  final Color warning;

  /// 语义状态色的浅底
  final Color warningContainer;

  /// 亮色主题（数值与 AppTheme 原有的 _light* 常量一致，保观感不变）
  static const AppColors light = AppColors(
    background: Color(0xFFF7F7F5),
    surface: Colors.white,
    surfaceAlt: Color(0xFFF0F0F0),
    border: Color(0xFFE0E0E0),
    text: Color(0xFF37352F),
    textSecondary: Color(0xFF9B9A97),
    primary: Color(0xFF37352F),
    onPrimary: Colors.white,
    accent: Color(0xFF135BEC),
    onAccent: Colors.white,
    accentContainer: Color(0xFFE8F3FF),
    success: Color(0xFF4EA05E),
    successContainer: Color(0xFFE8F5EA),
    onSuccess: Colors.white,
    error: Color(0xFFD95656),
    errorContainer: Color(0xFFFDECEC),
    onError: Colors.white,
    warning: Color(0xFFFF9500),
    warningContainer: Color(0xFFFFF4E5),
  );

  /// 暗色主题（数值与 AppTheme 原有的 _dark* 常量一致）
  static const AppColors dark = AppColors(
    background: Color(0xFF191919),
    surface: Color(0xFF2C2C2C),
    surfaceAlt: Color(0xFF222222),
    border: Color(0xFF333333),
    text: Color(0xFFE6E6E6),
    textSecondary: Color(0xFFA0A0A0),
    primary: Color(0xFFE6E6E6),
    onPrimary: Color(0xFF191919),
    accent: Color(0xFF7AA7FF),
    onAccent: Color(0xFF0E1A2E),
    accentContainer: Color(0xFF1A2A44),
    success: Color(0xFF6FBF7F),
    successContainer: Color(0xFF1E3B26),
    onSuccess: Colors.white,
    error: Color(0xFFE57373),
    errorContainer: Color(0xFF3B2020),
    onError: Colors.white,
    warning: Color(0xFFFFB74D),
    warningContainer: Color(0xFF3B2E1A),
  );

  @override
  AppColors copyWith({
    Color? background,
    Color? surface,
    Color? surfaceAlt,
    Color? border,
    Color? text,
    Color? textSecondary,
    Color? primary,
    Color? onPrimary,
    Color? accent,
    Color? onAccent,
    Color? accentContainer,
    Color? success,
    Color? successContainer,
    Color? onSuccess,
    Color? error,
    Color? errorContainer,
    Color? onError,
    Color? warning,
    Color? warningContainer,
  }) {
    return AppColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      border: border ?? this.border,
      text: text ?? this.text,
      textSecondary: textSecondary ?? this.textSecondary,
      primary: primary ?? this.primary,
      onPrimary: onPrimary ?? this.onPrimary,
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
      accentContainer: accentContainer ?? this.accentContainer,
      success: success ?? this.success,
      successContainer: successContainer ?? this.successContainer,
      onSuccess: onSuccess ?? this.onSuccess,
      error: error ?? this.error,
      errorContainer: errorContainer ?? this.errorContainer,
      onError: onError ?? this.onError,
      warning: warning ?? this.warning,
      warningContainer: warningContainer ?? this.warningContainer,
    );
  }

  @override
  AppColors lerp(covariant AppColors? other, double t) {
    if (other == null) return this;
    return AppColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      border: Color.lerp(border, other.border, t)!,
      text: Color.lerp(text, other.text, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      accentContainer: Color.lerp(
        accentContainer,
        other.accentContainer,
        t,
      )!,
      success: Color.lerp(success, other.success, t)!,
      successContainer: Color.lerp(
        successContainer,
        other.successContainer,
        t,
      )!,
      onSuccess: Color.lerp(onSuccess, other.onSuccess, t)!,
      error: Color.lerp(error, other.error, t)!,
      errorContainer: Color.lerp(errorContainer, other.errorContainer, t)!,
      onError: Color.lerp(onError, other.onError, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningContainer: Color.lerp(warningContainer, other.warningContainer, t)!,
    );
  }
}

/// `context.colors.surface` 这种写法比 `Theme.of(context).extension<AppColors>()!`
/// 短，而且**取不到时直接抛错**——比静默回退成某个颜色更容易发现漏挂。
extension AppColorsX on BuildContext {
  AppColors get colors {
    final AppColors? colors = Theme.of(this).extension<AppColors>();
    assert(colors != null, '主题里没有挂 AppColors，检查 AppTheme.lightTheme/darkTheme');
    return colors ?? AppColors.light;
  }
}
