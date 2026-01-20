import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 主题模式状态管理
///
/// 支持三种模式：跟随系统、亮色、暗色
/// 使用 Riverpod 3.x Notifier 模式
final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ThemeMode.system;

  /// 设置为跟随系统
  void setSystem() => state = ThemeMode.system;

  /// 设置为亮色模式
  void setLight() => state = ThemeMode.light;

  /// 设置为暗色模式
  void setDark() => state = ThemeMode.dark;

  /// 切换亮/暗模式（如果是跟随系统则切换到亮色）
  void toggle() {
    switch (state) {
      case ThemeMode.system:
      case ThemeMode.dark:
        state = ThemeMode.light;
        break;
      case ThemeMode.light:
        state = ThemeMode.dark;
        break;
    }
  }
}
