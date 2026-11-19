import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 应用主题定义
///
/// 提供统一的亮色/暗色主题配置，确保全局视觉一致性。
class AppTheme {
  AppTheme._();

  // ==================== 颜色常量 ====================

  // 亮色模式颜色
  static const Color _lightBackground = Color(0xFFF7F7F5);
  static const Color _lightSurface = Colors.white;
  static const Color _lightText = Color(0xFF37352F);
  static const Color _lightTextSecondary = Color(0xFF9B9A97);
  static const Color _lightBorder = Color(0xFFE0E0E0);

  // 暗色模式颜色
  static const Color _darkBackground = Color(0xFF191919);
  static const Color _darkSurface = Color(0xFF222222); // 稍微深一点
  static const Color _darkCard = Color(0xFF2C2C2C); // 增加层次感
  static const Color _darkText = Color(0xFFE6E6E6);
  static const Color _darkTextSecondary = Color(0xFFA0A0A0);
  static const Color _darkBorder = Color(0xFF333333); // 更细腻的边框

  // 通用强调色
  static const Color primaryColor = Color(0xFF37352F);
  static const Color accentColor = Color(0xFF135BEC);
  static const Color successColor = Color(0xFF4EA05E);
  static const Color errorColor = Color(0xFFD95656);
  static const Color warningColor = Color(0xFFFF9500);

  // ==================== 亮色主题 ====================

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: _lightBackground,
      cardColor: _lightSurface,
      dividerColor: _lightBorder,

      // 颜色方案
      colorScheme: const ColorScheme.light(
        primary: primaryColor,
        secondary: accentColor,
        surface: _lightSurface,
        error: errorColor,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: _lightText,
        onError: Colors.white,
      ),

      // 页面转场：显式写死，不依赖 Flutter 默认值（默认值会随 SDK 版本漂移，
      // 导致同一份代码在升级后观感突变）。
      // Android 用预测性返回（Android 15+ 对 targetSdk 35+ 的应用默认启用返回手势预览；
      // 非返回手势时该 builder 自身回落 FadeForwards，所以"推入"观感与 M3 一致）。
      // iOS/macOS 保持系统横向滑动；桌面其余平台走 Android 规则。
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
          // 桌面端同样显式指定：Flutter 对未列出的平台会用"默认值"，
          // 而默认值随 SDK 版本变化，桌面构建就会出现与移动端不同的转场
          TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        },
      ),

      // AppBar 主题
      appBarTheme: AppBarTheme(
        backgroundColor: _lightSurface,
        foregroundColor: _lightText,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 18.sp,
          fontWeight: FontWeight.w600,
          color: _lightText,
        ),
        iconTheme: const IconThemeData(color: _lightText),
      ),

      // 卡片主题
      cardTheme: CardThemeData(
        color: _lightSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12.r),
          side: const BorderSide(color: _lightBorder),
        ),
      ),

      // 按钮主题
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 12.h),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.r),
          ),
        ),
      ),

      // 文字主题
      textTheme: _buildTextTheme(_lightText, _lightTextSecondary),

      // 分割线主题
      dividerTheme: const DividerThemeData(color: _lightBorder, thickness: 1),

      // 底部导航主题
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: _lightSurface,
        selectedItemColor: primaryColor,
        unselectedItemColor: _lightTextSecondary,
      ),

      // 页面过渡：跟随平台默认。Android 走预测性返回（Android 15+ 对
      // targetSdk 35+ 的应用默认启用，开发者选项开关已移除），其余平台保持
      // 各自的默认过渡，不再全站套自定义 SharedAxis（见 docs/mobile-ui-kit.md D-1）。
    );
  }

  // ==================== 暗色主题 ====================

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: _darkBackground,
      cardColor: _darkSurface,
      dividerColor: _darkBorder,

      // 颜色方案
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFFE6E6E6),
        secondary: accentColor,
        surface: _darkSurface,
        surfaceContainer: _darkCard, // 新增
        error: errorColor,
        onPrimary: _darkBackground,
        onSecondary: Colors.white,
        onSurface: _darkText,
        onError: Colors.white,
      ),

      // 页面转场：显式写死，不依赖 Flutter 默认值（默认值会随 SDK 版本漂移，
      // 导致同一份代码在升级后观感突变）。
      // Android 用预测性返回（Android 15+ 对 targetSdk 35+ 的应用默认启用返回手势预览；
      // 非返回手势时该 builder 自身回落 FadeForwards，所以"推入"观感与 M3 一致）。
      // iOS/macOS 保持系统横向滑动；桌面其余平台走 Android 规则。
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
          // 桌面端同样显式指定：Flutter 对未列出的平台会用"默认值"，
          // 而默认值随 SDK 版本变化，桌面构建就会出现与移动端不同的转场
          TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        },
      ),

      // AppBar 主题
      appBarTheme: AppBarTheme(
        backgroundColor: _darkSurface,
        foregroundColor: _darkText,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 18.sp,
          fontWeight: FontWeight.w600,
          color: _darkText,
        ),
        iconTheme: const IconThemeData(color: _darkText),
      ),

      // 卡片主题
      cardTheme: CardThemeData(
        color: _darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12.r),
          side: const BorderSide(color: _darkBorder),
        ),
      ),

      // 按钮主题
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _darkText,
          foregroundColor: _darkBackground,
          elevation: 0,
          padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 12.h),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.r),
          ),
        ),
      ),

      // 文字主题
      textTheme: _buildTextTheme(_darkText, _darkTextSecondary),

      // 分割线主题
      dividerTheme: const DividerThemeData(color: _darkBorder, thickness: 1),

      // 底部导航主题
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: _darkSurface,
        selectedItemColor: _darkText,
        unselectedItemColor: _darkTextSecondary,
      ),

    );
  }

  // ==================== 共用配置 ====================

  // ==================== 辅助方法 ====================

  static TextTheme _buildTextTheme(Color primaryText, Color secondaryText) {
    return TextTheme(
      headlineLarge: TextStyle(
        fontSize: 32.sp,
        fontWeight: FontWeight.bold,
        color: primaryText,
      ),
      headlineMedium: TextStyle(
        fontSize: 24.sp,
        fontWeight: FontWeight.bold,
        color: primaryText,
      ),
      headlineSmall: TextStyle(
        fontSize: 20.sp,
        fontWeight: FontWeight.w600,
        color: primaryText,
      ),
      titleLarge: TextStyle(
        fontSize: 18.sp,
        fontWeight: FontWeight.w600,
        color: primaryText,
      ),
      titleMedium: TextStyle(
        fontSize: 16.sp,
        fontWeight: FontWeight.w500,
        color: primaryText,
      ),
      titleSmall: TextStyle(
        fontSize: 14.sp,
        fontWeight: FontWeight.w500,
        color: primaryText,
      ),
      bodyLarge: TextStyle(fontSize: 16.sp, color: primaryText),
      bodyMedium: TextStyle(fontSize: 14.sp, color: primaryText),
      bodySmall: TextStyle(fontSize: 12.sp, color: secondaryText),
      labelLarge: TextStyle(
        fontSize: 14.sp,
        fontWeight: FontWeight.w600,
        color: primaryText,
      ),
      labelMedium: TextStyle(
        fontSize: 12.sp,
        fontWeight: FontWeight.w500,
        color: secondaryText,
      ),
      labelSmall: TextStyle(
        fontSize: 10.sp,
        fontWeight: FontWeight.w500,
        color: secondaryText,
      ),
    );
  }
}

/// 扩展方法：获取自适应颜色
extension ThemeExtension on BuildContext {
  /// 获取当前是否为暗色模式
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  /// 获取主要文字颜色
  Color get textColor => Theme.of(this).colorScheme.onSurface;

  /// 获取次要文字颜色
  Color get secondaryTextColor =>
      isDarkMode ? const Color(0xFF8A8A8A) : const Color(0xFF9B9A97);

  /// 获取卡片背景色
  Color get cardBackgroundColor => Theme.of(this).cardColor;

  /// 获取边框颜色
  Color get borderColor => Theme.of(this).dividerColor;
}
