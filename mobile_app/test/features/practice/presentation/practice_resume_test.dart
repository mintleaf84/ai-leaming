import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/practice_resume.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/presentation/practice_resume_provider.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/fake_providers.dart';

/// 练习断点（审计 §25 F5）。
///
/// 守的线：
/// 1. 练习一开始就有断点（杀进程重开能续），每答一题已答数跟着涨；
/// 2. `reset()`（正常结束 / 主动退出 / 换一场）把断点清掉，
///    首页不会留一个点进去就空的「继续」；
/// 3. 断点格式漂移或已答完时**按没有断点处理**，不硬恢复一场空练习。
void main() {
  setUpAll(useFakeSecureStorage);

  late FakePreferencesStore prefs;
  late ProviderContainer container;
  late FakePracticeRepository repository;

  setUp(() {
    prefs = FakePreferencesStore();
    repository = FakePracticeRepository(
      questions: <Question>[
        for (var i = 1; i <= 3; i++) fakeQuestion(id: '$i'),
      ],
    );
    container = ProviderContainer(
      overrides: [
        practiceRepositoryProvider.overrideWithValue(repository),
        preferencesStoreProvider.overrideWithValue(prefs),
      ],
    );
    addTearDown(container.dispose);
  });

  PracticeResume? resume() => container.read(practiceResumeControllerProvider);

  /// 断点写入是 fire-and-forget（`unawaited`），等一轮微任务让它落盘。
  Future<void> flush() => Future<void>.delayed(Duration.zero);

  test('开始练习即落盘断点：sessionId / 总题数 / 已答 0', () async {
    await container
        .read(practiceControllerProvider.notifier)
        .createSession(limit: 3);
    await flush();

    final saved = resume();
    expect(saved, isNotNull);
    expect(saved!.sessionId, 'session_1');
    expect(saved.total, 3);
    expect(saved.answered, 0);
    // 落盘的那份也解析得回来（重启后的读路径）
    expect(
      PracticeResume.decode(prefs.values[PreferencesKeys.practiceResume]),
      isNotNull,
    );
  });

  test('每答一题已答数跟着涨', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();

    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    expect(resume()!.answered, 1);
    expect(
      PracticeResume.decode(
        prefs.values[PreferencesKeys.practiceResume],
      )!.answered,
      1,
    );
  });

  test('reset 清掉断点（正常结束 / 主动退出 / 换一场）', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();
    expect(resume(), isNotNull);

    controller.reset();
    await flush();

    expect(resume(), isNull);
    expect(
      PracticeResume.decode(prefs.values[PreferencesKeys.practiceResume]),
      isNull,
      reason: '空串等价于「没有断点」',
    );
  });

  test('续练从断点那一题开始（不重答已判过的题）', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession('session_9', startIndex: 2);
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.sessionId, 'session_9');
    expect(state.currentIndex, 2);
    expect(repository.loadedSessions, contains('session_9'));
    // 续练本身也要刷新断点（否则进度会停在旧值）
    expect(resume()!.sessionId, 'session_9');
  });

  test('startIndex 越界时夹回合法范围，不崩', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession('session_9', startIndex: 99);
    await flush();

    expect(container.read(practiceControllerProvider).currentIndex, 2);
  });

  test('重启后能从本地存储恢复断点', () async {
    final raw = jsonEncode(<String, dynamic>{
      'sessionId': 'session_9',
      'answered': 2,
      'total': 8,
      'mode': 'random',
      'savedAt': DateTime.now().toIso8601String(),
    });
    final store = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.practiceResume: raw},
    );
    final fresh = ProviderContainer(
      overrides: [
        preferencesStoreProvider.overrideWithValue(store),
      ],
    );
    addTearDown(fresh.dispose);

    await fresh.read(practiceResumeControllerProvider.notifier).restore();

    final restored = fresh.read(practiceResumeControllerProvider);
    expect(restored, isNotNull);
    expect(restored!.sessionId, 'session_9');
    expect(restored.startIndex, 2);
  });

  group('断点解析（格式漂移一律当没有断点）', () {
    PracticeResume? parse(Map<String, dynamic> json) =>
        PracticeResume.fromJson(json);

    test('已答完（answered ≥ total）不再恢复', () {
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answered': 8,
          'total': 8,
          'savedAt': '2026-11-20T10:00:00.000',
        }),
        isNull,
      );
    });

    test('sessionId 为空 / total 为 0 / answered 为负都算无效', () {
      expect(
        parse(<String, dynamic>{'sessionId': '', 'answered': 0, 'total': 8}),
        isNull,
      );
      expect(
        parse(<String, dynamic>{'sessionId': 's1', 'answered': 0, 'total': 0}),
        isNull,
      );
      expect(
        parse(<String, dynamic>{'sessionId': 's1', 'answered': -1, 'total': 8}),
        isNull,
      );
    });

    test('半截 JSON / 非对象 / 空串都返回 null', () {
      expect(PracticeResume.decode('{"sessionId":'), isNull);
      expect(PracticeResume.decode('[1,2,3]'), isNull);
      expect(PracticeResume.decode(''), isNull);
      expect(PracticeResume.decode(null), isNull);
    });

    test('缺 savedAt / mode 时给默认值，不影响恢复', () {
      final parsed = parse(<String, dynamic>{
        'sessionId': 's1',
        'answered': 1,
        'total': 8,
      });
      expect(parsed, isNotNull);
      expect(parsed!.mode, 'random');
    });
  });
}
