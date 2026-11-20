import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/preferences.dart';

enum ReviewMode {
  list, // 清单模式
  immersive, // 沉浸模式
}

class SettingsState {
  final ReviewMode reviewMode;

  const SettingsState({this.reviewMode = ReviewMode.list});

  SettingsState copyWith({ReviewMode? reviewMode}) {
    return SettingsState(reviewMode: reviewMode ?? this.reviewMode);
  }
}

class SettingsNotifier extends Notifier<SettingsState> {
  /// 同 theme：读盘回来之前用户可能已经改过，迟到的结果不许覆盖。
  bool _userChanged = false;

  /// 只读一次盘：`build()` 与测试里的显式 `await restore()` 共用同一个 future。
  Future<void>? _restoreFuture;

  @override
  SettingsState build() {
    unawaited(restore());
    return const SettingsState();
  }

  /// 从本地存储恢复复习模式。
  ///
  /// 由 [build] 自动触发；测试里可 `await`。非法值/读失败回落到清单模式。
  Future<void> restore() => _restoreFuture ??= _restoreFromStore();

  Future<void> _restoreFromStore() async {
    final store = ref.read(preferencesStoreProvider);
    final String? raw;
    try {
      raw = await store.read(PreferencesKeys.reviewMode);
    } catch (error) {
      debugPrint('[Settings] 读取复习模式失败，回退清单模式: $error');
      return;
    }
    if (!ref.mounted || _userChanged) return;
    state = SettingsState(reviewMode: _decode(raw));
  }

  void setReviewMode(ReviewMode mode) {
    _userChanged = true;
    state = state.copyWith(reviewMode: mode);
    unawaited(_persist(mode));
  }

  /// 写盘失败不回滚、不弹错：设置已经在界面上生效了。
  Future<void> _persist(ReviewMode mode) async {
    final store = ref.read(preferencesStoreProvider);
    try {
      await store.write(PreferencesKeys.reviewMode, _encode(mode));
    } catch (error) {
      debugPrint('[Settings] 保存复习模式失败（界面保持已切换状态）: $error');
    }
  }

  static String _encode(ReviewMode mode) {
    switch (mode) {
      case ReviewMode.list:
        return 'list';
      case ReviewMode.immersive:
        return 'immersive';
    }
  }

  static ReviewMode _decode(String? raw) {
    switch (raw) {
      case 'immersive':
        return ReviewMode.immersive;
      case 'list':
      default:
        return ReviewMode.list;
    }
  }
}

final settingsProvider = NotifierProvider<SettingsNotifier, SettingsState>(
  SettingsNotifier.new,
);
