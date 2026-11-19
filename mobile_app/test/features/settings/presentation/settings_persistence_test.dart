import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/settings/presentation/settings_provider.dart';

import '../../../support/fake_preferences_store.dart';

/// 复习模式的**持久化**（审计 #19）：原来切完就只在内存里，重启回清单模式。
///
/// 与 theme 的测试同构，守三条线：往返、非法值/读失败兜底、写失败不回滚。
void main() {
  ProviderContainer makeContainer(FakePreferencesStore store) {
    final container = ProviderContainer(
      overrides: [preferencesStoreProvider.overrideWithValue(store)],
      retry: (_, _) => null,
    );
    addTearDown(container.dispose);
    return container;
  }

  group('往返', () {
    test('启动时恢复沉浸模式，切换后写回同一个键', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{PreferencesKeys.reviewMode: 'immersive'},
      );
      final container = makeContainer(store);

      await container.read(settingsProvider.notifier).restore();
      expect(container.read(settingsProvider).reviewMode, ReviewMode.immersive);

      container.read(settingsProvider.notifier).setReviewMode(ReviewMode.list);
      await Future<void>.delayed(Duration.zero);

      expect(container.read(settingsProvider).reviewMode, ReviewMode.list);
      expect(store.writes.single.key, PreferencesKeys.reviewMode);
      expect(store.writes.single.value, 'list');
    });

    test('写失败不回滚、不抛错：状态仍是用户刚选的那一档', () async {
      final store = FakePreferencesStore()
        ..writeError = StateError('disk full');
      final container = makeContainer(store);

      container
          .read(settingsProvider.notifier)
          .setReviewMode(ReviewMode.immersive);
      await Future<void>.delayed(Duration.zero);

      expect(
        container.read(settingsProvider).reviewMode,
        ReviewMode.immersive,
        reason: '存不下来不该把界面弹回清单模式',
      );
      expect(store.writes, isEmpty);
    });
  });

  group('兜底', () {
    test('非法值回落到清单模式', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{PreferencesKeys.reviewMode: 'grid'},
      );
      final container = makeContainer(store);

      await container.read(settingsProvider.notifier).restore();

      expect(container.read(settingsProvider).reviewMode, ReviewMode.list);
    });

    test('读失败回落到清单模式，且不把异常抛给调用方', () async {
      final store = FakePreferencesStore()
        ..readError = StateError('platform channel missing');
      final container = makeContainer(store);

      await expectLater(
        container.read(settingsProvider.notifier).restore(),
        completes,
      );
      expect(container.read(settingsProvider).reviewMode, ReviewMode.list);
    });
  });
}
