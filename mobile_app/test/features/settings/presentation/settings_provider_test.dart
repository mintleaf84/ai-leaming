import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/settings/presentation/settings_provider.dart';

import '../../../support/fake_preferences_store.dart';

/// 这个测试守的是复习模式设置的**默认值与切换语义**（这个 provider 只有 7 行，
/// 不承载异步逻辑）：
///
/// 1. **默认是清单模式**：字典序上 `ReviewMode.list` 是 0，但默认值写在
///    `SettingsState` 的构造参数上——有人把默认改掉，用户的首次体验就从
///    「清单」变成「沉浸」，这里钉住它。
/// 2. **切换以最后一次为准**，且不影响其他状态（将来加字段时，切换模式不能
///    顺手把别的设置重置）。
/// 3. **状态按 container 隔离**：不同 container 之间不共享，测试里的脏值不会
///    串到别的用例。
/// 4. **持久化走可注入的 store**（审计 #19）：这里注入内存假 store，
///    验证「切换会写盘、重建能从同一份 store 读回」，不碰平台通道。
///    读写失败/非法值的兜底由 `settings_persistence_test.dart` 覆盖。
void main() {
  ProviderContainer makeContainer({FakePreferencesStore? store}) {
    final container = ProviderContainer(
      overrides: [
        preferencesStoreProvider.overrideWithValue(
          store ?? FakePreferencesStore(),
        ),
      ],
      retry: (_, _) => null,
    );
    addTearDown(container.dispose);
    return container;
  }

  group('默认值', () {
    test('未操作过时是清单模式', () {
      final container = makeContainer();

      final state = container.read(settingsProvider);

      expect(state.reviewMode, ReviewMode.list);
    });
  });

  group('切换', () {
    test('切到沉浸模式', () {
      final container = makeContainer();

      container
          .read(settingsProvider.notifier)
          .setReviewMode(ReviewMode.immersive);

      expect(container.read(settingsProvider).reviewMode, ReviewMode.immersive);
    });

    test('可以切回清单模式', () {
      final container = makeContainer();
      final notifier = container.read(settingsProvider.notifier);

      notifier.setReviewMode(ReviewMode.immersive);
      notifier.setReviewMode(ReviewMode.list);

      expect(container.read(settingsProvider).reviewMode, ReviewMode.list);
    });

    test('重复设置同一模式是幂等的', () {
      final container = makeContainer();
      final notifier = container.read(settingsProvider.notifier);

      notifier.setReviewMode(ReviewMode.immersive);
      final first = container.read(settingsProvider);
      notifier.setReviewMode(ReviewMode.immersive);
      final second = container.read(settingsProvider);

      expect(second.reviewMode, first.reviewMode);
      expect(
        identical(first, second),
        isFalse,
        reason: '每次 set 都会生成新状态，界面才会重建',
      );
    });
  });

  group('隔离与持久化', () {
    test('不同 container 的状态互不影响', () {
      final a = makeContainer();
      final b = makeContainer();

      a.read(settingsProvider.notifier).setReviewMode(ReviewMode.immersive);

      expect(a.read(settingsProvider).reviewMode, ReviewMode.immersive);
      expect(b.read(settingsProvider).reviewMode, ReviewMode.list);
    });

    test('设置会落盘：同一个 store 下销毁重建后仍是上次的选择', () async {
      final store = FakePreferencesStore();
      final first = makeContainer(store: store);
      first.read(settingsProvider.notifier).setReviewMode(ReviewMode.immersive);
      await Future<void>.delayed(Duration.zero);
      first.dispose();

      final second = makeContainer(store: store);
      await second.read(settingsProvider.notifier).restore();

      expect(
        second.read(settingsProvider).reviewMode,
        ReviewMode.immersive,
        reason: '重启 App 后用户的复习模式不该被重置',
      );
    });
  });
}
