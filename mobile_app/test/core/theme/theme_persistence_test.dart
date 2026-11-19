import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/core/theme/theme_provider.dart';

import '../../support/fake_preferences_store.dart';

/// 主题选择的**持久化**（审计 #19）。原来 `build()` 恒为 system，重启即丢。
///
/// 这个文件守三条线：
/// 1. 往返：写进去的值重启后能读回来（键名与编码一致，不是各写一套）；
/// 2. 兜底：非法值 / 读失败一律回 `system`，且**不抛**（设置坏了不能拦住启动）；
/// 3. 写失败不回滚：磁盘写不进去时，界面上的主题仍然保持用户刚选的那一档。
void main() {
  /// 每个用例自己拿 container，保证 provider 状态互不串台。
  ProviderContainer makeContainer(FakePreferencesStore store) {
    final container = ProviderContainer(
      overrides: [preferencesStoreProvider.overrideWithValue(store)],
      // 不重试：读失败是预期路径，重试只会拖慢测试并掩盖真实行为。
      retry: (_, _) => null,
    );
    addTearDown(container.dispose);
    return container;
  }

  group('往返', () {
    test('启动时恢复上次选择的暗色，切换后写回同一个键', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{PreferencesKeys.themeMode: 'dark'},
      );
      final container = makeContainer(store);

      await container.read(themeModeProvider.notifier).restore();
      expect(
        container.read(themeModeProvider),
        ThemeMode.dark,
        reason: '上次选了暗色，重启后必须还是暗色',
      );

      container.read(themeModeProvider.notifier).setLight();
      // 写入是 unawaited 的，这里让微任务跑完再断言。
      await Future<void>.delayed(Duration.zero);

      expect(container.read(themeModeProvider), ThemeMode.light);
      expect(store.writes.single.key, PreferencesKeys.themeMode);
      expect(store.writes.single.value, 'light');
      expect(store.values[PreferencesKeys.themeMode], 'light');
    });

    test('写失败不回滚、不抛错：状态仍是用户刚选的那一档', () async {
      final store = FakePreferencesStore()
        ..writeError = StateError('disk full');
      final container = makeContainer(store);

      container.read(themeModeProvider.notifier).setDark();
      await Future<void>.delayed(Duration.zero);

      expect(
        container.read(themeModeProvider),
        ThemeMode.dark,
        reason: '存不下来是后台问题，不该把界面弹回上一个主题',
      );
      expect(store.writes, isEmpty);
    });
  });

  group('兜底', () {
    test('非法值（旧版本/人手改过）回落到跟随系统', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{PreferencesKeys.themeMode: 'purple'},
      );
      final container = makeContainer(store);

      await container.read(themeModeProvider.notifier).restore();

      expect(container.read(themeModeProvider), ThemeMode.system);
    });

    test('读失败回落到跟随系统，且不把异常抛给调用方', () async {
      final store = FakePreferencesStore()
        ..readError = StateError('platform channel missing');
      final container = makeContainer(store);

      await expectLater(
        container.read(themeModeProvider.notifier).restore(),
        completes,
        reason: '读设置失败不该让 App 启动失败',
      );
      expect(container.read(themeModeProvider), ThemeMode.system);
    });
  });
}
