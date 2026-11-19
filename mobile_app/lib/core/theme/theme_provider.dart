import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/preferences.dart';

/// 主题模式状态管理
///
/// 支持三种模式：跟随系统、亮色、暗色。
/// 选择会持久化到本地（键 [PreferencesKeys.themeMode]），重启后恢复。
/// 使用 Riverpod 3.x Notifier 模式。
final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  /// 用户是否在本进程内手动改过。
  ///
  /// 读盘是异步的：启动时 `restore()` 还没回来，用户可能已经进了设置页点了
  /// 切换。没有这个标记的话，迟到的读盘结果会把用户刚做的选择覆盖掉。
  bool _userChanged = false;

  /// 只读一次盘：`build()` 与测试里的显式 `await restore()` 共用同一个 future。
  Future<void>? _restoreFuture;

  @override
  ThemeMode build() {
    // 先给出同步的默认值（跟随系统），再异步补上上次的选择：
    // `build()` 不能是 async，否则 MaterialApp 首帧会拿到 loading。
    unawaited(restore());
    return ThemeMode.system;
  }

  /// 从本地存储恢复上次的选择。
  ///
  /// 正常情况下由 [build] 自动触发；测试里可以 `await` 它来消除异步等待。
  /// 非法值（旧版本写的、被人手改的）与读失败一律回落到 `system`。
  Future<void> restore() => _restoreFuture ??= _restoreFromStore();

  Future<void> _restoreFromStore() async {
    final store = ref.read(preferencesStoreProvider);
    final String? raw;
    try {
      raw = await store.read(PreferencesKeys.themeMode);
    } catch (error) {
      // 读失败不是错误状态：用户看到的只是「跟随系统」，App 照常可用。
      debugPrint('[Theme] 读取主题设置失败，回退跟随系统: $error');
      return;
    }
    if (!ref.mounted || _userChanged) return;
    state = _decode(raw);
  }

  /// 设置为跟随系统
  void setSystem() => _apply(ThemeMode.system);

  /// 设置为亮色模式
  void setLight() => _apply(ThemeMode.light);

  /// 设置为暗色模式
  void setDark() => _apply(ThemeMode.dark);

  /// 切换亮/暗模式（如果是跟随系统则切换到亮色）
  void toggle() {
    switch (state) {
      case ThemeMode.system:
      case ThemeMode.dark:
        _apply(ThemeMode.light);
        break;
      case ThemeMode.light:
        _apply(ThemeMode.dark);
        break;
    }
  }

  /// 状态先行、持久化随后。
  ///
  /// 写盘失败**不回滚**也不报错：主题已经切了，用户看得见；为了「存不下来」
  /// 把界面弹回去只会让人以为点击没生效。失败只留日志。
  void _apply(ThemeMode mode) {
    _userChanged = true;
    state = mode;
    unawaited(_persist(mode));
  }

  Future<void> _persist(ThemeMode mode) async {
    // 先取 store（同步），避免 await 之后 provider 已销毁再访问 ref。
    final store = ref.read(preferencesStoreProvider);
    try {
      await store.write(PreferencesKeys.themeMode, _encode(mode));
    } catch (error) {
      debugPrint('[Theme] 保存主题设置失败（界面保持已切换状态）: $error');
    }
  }

  static String _encode(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.system:
        return 'system';
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
    }
  }

  static ThemeMode _decode(String? raw) {
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
      default:
        return ThemeMode.system;
    }
  }
}
