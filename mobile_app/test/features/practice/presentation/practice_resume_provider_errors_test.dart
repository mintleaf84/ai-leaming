import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/practice/domain/practice_resume.dart';
import 'package:mobile_app/features/practice/presentation/practice_resume_provider.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/fake_providers.dart';

/// 断点持久化的三条**失败路径**。
///
/// 为什么单独一个文件：`practice_resume_test.dart` 守的是「断点内容对不对」，
/// 这里守的是「磁盘/通道坏了会怎样」。这类分支只在故障注入下才会跑到，平时
/// 一行都不会执行——而它们恰恰决定了「本地存储坏掉时练习要不要报错」。
///
/// 约定（见 `practice_resume_provider.dart` 注释）：持久化失败**不影响当前
/// 状态**，最多是「不能续练」，不该让正在进行的练习失败。
void main() {
  setUpAll(useFakeSecureStorage);

  PracticeResume sample({String userId = 'u1'}) => PracticeResume(
    sessionId: 'session_1',
    answers: const <ResumeAnswer>[],
    nextIndex: 0,
    total: 3,
    userId: userId,
    savedAt: DateTime.utc(2026, 11, 20),
  );

  ProviderContainer containerWith(FakePreferencesStore prefs) {
    final container = ProviderContainer(
      overrides: [preferencesStoreProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('读盘抛错：按「没有断点」处理，不向调用方抛', () async {
    final prefs = FakePreferencesStore(readError: StateError('disk broken'));
    final container = containerWith(prefs);

    // build() 里的 restore 是 fire-and-forget，等它的那一份 future。
    await container.read(practiceResumeControllerProvider.notifier).restore();

    expect(container.read(practiceResumeControllerProvider), isNull);
  });

  test('写盘抛错：内存状态照旧更新（练习不受影响）', () async {
    final prefs = FakePreferencesStore(writeError: StateError('disk full'));
    final container = containerWith(prefs);
    final controller = container.read(practiceResumeControllerProvider.notifier);

    await controller.save(sample());

    expect(
      container.read(practiceResumeControllerProvider),
      isNotNull,
      reason: '落盘失败只该影响「能不能续练」，不该回滚首页的断点入口',
    );
    expect(prefs.values, isEmpty);
  });

  test('清除时写盘抛错：内存先清空，且不抛给调用方', () async {
    final prefs = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.practiceResume: '{}'},
      writeError: StateError('disk full'),
    );
    final container = containerWith(prefs);
    final controller = container.read(practiceResumeControllerProvider.notifier);

    await controller.save(sample());
    await controller.clear();

    expect(
      container.read(practiceResumeControllerProvider),
      isNull,
      reason: '清内存先于写盘：写盘失败也不能留一个已经作废的入口',
    );
  });
}
