import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/theme/theme_provider.dart';

/// 主题模式是**全局单例状态**，`MaterialApp.themeMode` 直接 watch 它。
/// 这个测试守的线：
///
/// 1. 默认必须是 `ThemeMode.system`：App 首次启动跟随系统，不能把用户锁进
///    亮色或暗色（暗色用户第一次打开就被闪一下白屏是实打实的体验问题）；
/// 2. 三个 setter 各自只改自己那一档，互不串台；
/// 3. `toggle()` 的三条分支：system → light（"跟随系统时点一下" 落到亮色，
///    而不是直接跳暗色），light ↔ dark 往返；
/// 4. 状态变化必须真的通知监听者 —— `Notifier` 里 `state = ...` 赋值相同值时
///    Riverpod 不会通知，主题页的选中态就靠这个更新。
///
/// 注：当前实现**不做持久化**（`build()` 恒为 system），所以这里没有"重启后
/// 恢复上次选择"的用例；真要加持久化，本文件需要补一条往返用例。
void main() {
  ProviderContainer makeContainer() {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    return container;
  }

  group('默认值', () {
    test('首次构建为跟随系统', () {
      final container = makeContainer();

      expect(container.read(themeModeProvider), ThemeMode.system);
    });

    test('多次读取拿到同一个 notifier（不是每次新建）', () {
      final container = makeContainer();

      final first = container.read(themeModeProvider.notifier);
      first.setDark();
      final second = container.read(themeModeProvider.notifier);

      expect(identical(first, second), isTrue);
      expect(container.read(themeModeProvider), ThemeMode.dark);
    });
  });

  group('setSystem / setLight / setDark', () {
    test('setDark 切到暗色', () {
      final container = makeContainer();

      container.read(themeModeProvider.notifier).setDark();

      expect(container.read(themeModeProvider), ThemeMode.dark);
    });

    test('setLight 切到亮色', () {
      final container = makeContainer();

      container.read(themeModeProvider.notifier).setLight();

      expect(container.read(themeModeProvider), ThemeMode.light);
    });

    test('setSystem 从暗色回到跟随系统', () {
      final container = makeContainer();
      final notifier = container.read(themeModeProvider.notifier);
      notifier.setDark();

      notifier.setSystem();

      expect(container.read(themeModeProvider), ThemeMode.system);
    });
  });

  group('toggle：跟随系统时落到亮色', () {
    test('system → light', () {
      final container = makeContainer();

      container.read(themeModeProvider.notifier).toggle();

      expect(
        container.read(themeModeProvider),
        ThemeMode.light,
        reason: '跟随系统时点切换应落到亮色（与"再点一下变暗"的直觉一致）',
      );
    });

    test('light → dark', () {
      final container = makeContainer();
      final notifier = container.read(themeModeProvider.notifier);
      notifier.setLight();

      notifier.toggle();

      expect(container.read(themeModeProvider), ThemeMode.dark);
    });

    test('dark → light', () {
      final container = makeContainer();
      final notifier = container.read(themeModeProvider.notifier);
      notifier.setDark();

      notifier.toggle();

      expect(container.read(themeModeProvider), ThemeMode.light);
    });

    test('连续 toggle 两次回到原点（light ↔ dark 是闭环）', () {
      final container = makeContainer();
      final notifier = container.read(themeModeProvider.notifier);
      notifier.setLight();

      notifier.toggle();
      notifier.toggle();

      expect(container.read(themeModeProvider), ThemeMode.light);
    });
  });

  group('监听者收到通知', () {
    test('每次真实变化都通知一次，重复赋同值不再通知', () {
      final container = makeContainer();
      final seen = <ThemeMode>[];
      container.listen<ThemeMode>(
        themeModeProvider,
        (previous, next) => seen.add(next),
      );

      final notifier = container.read(themeModeProvider.notifier);
      notifier.setDark();
      notifier.setDark(); // 同值：不该再发一次
      notifier.setLight();

      expect(seen, [ThemeMode.dark, ThemeMode.light]);
    });
  });
}
