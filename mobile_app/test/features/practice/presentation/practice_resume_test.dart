import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/history/domain/history_item.dart';
import 'package:mobile_app/features/history/presentation/history_provider.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/practice_resume.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/presentation/practice_resume_provider.dart';
import 'package:mobile_app/features/wrong_book/data/wrong_book_repository.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/fake_providers.dart';

/// 练习断点（审计 §25 F5 + review A1–A4/B6–B7）。
///
/// 守的线：
/// 1. 练习一开始就有断点（杀进程重开能续），每答一题已答记录跟着涨；
/// 2. `reset()`（正常结束 / 主动退出 / 换一场）把断点清掉，
///    首页不会留一个点进去就空的「继续」；
/// 3. 断点格式漂移或已答完时**按没有断点处理**，不硬恢复一场空练习；
/// 4. 跳题作答时恢复位置是**第一道未答题**，不是「已答数」；
/// 5. 续练回填 `results`，结果页统计包含恢复前的作答（断点不被写成 0）；
/// 6. `persisted=false` 的作答不推进断点；
/// 7. 迟到的续练响应在 `reset()` 之后必须丢弃；
/// 8. 练习结束后首页历史重新拉取、错题总数失效。
void main() {
  setUpAll(useFakeSecureStorage);

  late FakePreferencesStore prefs;
  late ProviderContainer container;
  late FakePracticeRepository repository;
  late FakeHistoryController history;

  setUp(() {
    prefs = FakePreferencesStore();
    repository = FakePracticeRepository(
      questions: <Question>[
        for (var i = 1; i <= 3; i++) fakeQuestion(id: '$i'),
      ],
    );
    history = FakeHistoryController(
      const HistoryListState(items: <HistoryItem>[]),
    );
    container = ProviderContainer(
      overrides: [
        practiceRepositoryProvider.overrideWithValue(repository),
        preferencesStoreProvider.overrideWithValue(prefs),
        historyControllerProvider.overrideWith(() => history),
      ],
    );
    addTearDown(container.dispose);
  });

  PracticeResume? resume() => container.read(practiceResumeControllerProvider);

  PracticeResume? persisted() => PracticeResume.decode(
    prefs.values[PreferencesKeys.practiceResume],
  );

  /// 断点写入是 fire-and-forget（`unawaited`），等一轮微任务让它落盘。
  Future<void> flush() => Future<void>.delayed(Duration.zero);

  test('开始练习即落盘断点：sessionId / 总题数 / 没有已答记录', () async {
    await container
        .read(practiceControllerProvider.notifier)
        .createSession(limit: 3);
    await flush();

    final saved = resume();
    expect(saved, isNotNull);
    expect(saved!.sessionId, 'session_1');
    expect(saved.total, 3);
    expect(saved.answers, isEmpty);
    expect(saved.answeredCount, 0);
    expect(saved.nextIndex, 0);
    // 落盘的那份也解析得回来（重启后的读路径）
    expect(persisted(), isNotNull);
  });

  test('顺序作答：已答记录与下一题下标一起涨', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();

    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    expect(resume()!.answeredCount, 1);
    expect(resume()!.answers.single.questionId, '1');
    expect(resume()!.answers.single.isCorrect, isTrue);
    expect(resume()!.nextIndex, 1, reason: '答完第 1 题，下一题是第 2 题');
    expect(persisted()!.answeredCount, 1);
    expect(persisted()!.nextIndex, 1);
  });

  test('跳题作答：下一题下标取第一道未答题，而不是已答数', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();

    // 跳到第 2 题作答：第 1 题没做
    controller.nextQuestion();
    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    final saved = resume()!;
    expect(saved.answeredCount, 1);
    expect(saved.answers.single.questionId, '2');
    expect(
      saved.nextIndex,
      0,
      reason: '第 1 题仍未作答，恢复后必须回到它（已答数 1 会错落到第 2 题）',
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
    expect(persisted(), isNull, reason: '空串等价于「没有断点」');
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

  test('续练回填已答结果，且不会把进度覆盖成 0', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession(
      'session_9',
      startIndex: 0,
      answered: const <ResumeAnswer>[
        ResumeAnswer(questionId: '1', isCorrect: true),
        ResumeAnswer(questionId: '3', isCorrect: false),
      ],
    );
    await flush();

    final state = container.read(practiceControllerProvider);
    // 回填结果：结果页的「正确 / 错误」包含恢复前的作答
    expect(state.results, <String, bool>{'1': true, '3': false});
    // 落点 = 第一道未答题（第 2 题）
    expect(state.currentIndex, 1);

    final saved = resume()!;
    expect(saved.answeredCount, 2, reason: '续练不能把真实进度写成 0');
    expect(saved.answers.map((a) => a.questionId), <String>['1', '3']);
    expect(saved.nextIndex, 1);
    expect(persisted()!.answeredCount, 2);
  });

  test('断点里不存在的题号被忽略（题面已换的会话）', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession(
      'session_9',
      answered: const <ResumeAnswer>[
        ResumeAnswer(questionId: '999', isCorrect: true),
      ],
    );
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.results, isEmpty);
    expect(state.currentIndex, 0);
  });

  test('persisted=false 的作答不推进断点（重启后回到这道题）', () async {
    repository.submitResponse = const <String, dynamic>{
      'isCorrect': true,
      'correctAnswer': 'A',
      'offline': true,
      'persisted': false,
    };
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();

    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    // 判分结果仍要给用户看
    expect(container.read(practiceControllerProvider).results['1'], isTrue);
    final saved = resume()!;
    expect(saved.answers, isEmpty, reason: '没保存下来的作答不能算进断点');
    expect(saved.nextIndex, 0, reason: '重启后必须回到这道题重练');
  });

  test('续练请求迟到：reset 之后的响应（含异常）必须丢弃', () async {
    final gate = Completer<void>();
    repository.getSessionGate = gate;

    final controller = container.read(practiceControllerProvider.notifier);
    final pending = controller.loadSession('session_9', startIndex: 1);
    await flush();

    controller.reset();
    gate.complete();
    await pending;
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.sessionId, isNull, reason: '旧会话不能把 reset 之后的状态写回来');
    expect(state.questions, isEmpty);
    expect(state.isLoading, isFalse);
    expect(resume(), isNull, reason: '旧响应不该重新落一个断点');
  });

  test('续练失败但已 reset：错误不写回界面', () async {
    final gate = Completer<void>();
    repository.getSessionGate = gate;
    repository.createError = Exception('offline');

    final controller = container.read(practiceControllerProvider.notifier);
    final pending = controller.loadSession('session_9');
    await flush();

    controller.reset();
    gate.complete();
    await pending;
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.error, isNull);
    expect(state.sessionId, isNull);
  });

  test('离线会话（local_）续练：标记为离线，断点照常写', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession('local_123');
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.isOffline, isTrue);
    expect(resume()!.sessionId, 'local_123');
  });

  test('startIndex 越界时夹回合法范围，不崩', () async {
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.loadSession('session_9', startIndex: 99);
    await flush();

    expect(container.read(practiceControllerProvider).currentIndex, 2);
  });

  test('重启后能从本地存储恢复断点（旧格式：只有已答数）', () async {
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

  test('重启后能从本地存储恢复断点（新格式：题号 + 对错）', () async {
    final raw = jsonEncode(<String, dynamic>{
      'sessionId': 'session_9',
      'answers': <Map<String, dynamic>>[
        <String, dynamic>{'id': '1', 'correct': true},
        <String, dynamic>{'id': '3', 'correct': false},
      ],
      'nextIndex': 1,
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

    final restored = fresh.read(practiceResumeControllerProvider)!;
    expect(restored.answeredCount, 2);
    expect(restored.answers.map((a) => a.questionId), <String>['1', '3']);
    expect(restored.nextIndex, 1);
  });

  group('练习结束后的首页数据（review B6/B7）', () {
    test('reset 让首页历史重新拉取', () async {
      final controller = container.read(practiceControllerProvider.notifier);
      await controller.createSession(limit: 3);
      await flush();
      final before = history.loadCalls;

      controller.reset();
      await flush();

      expect(
        history.loadCalls,
        before + 1,
        reason: '练习结束要重新取「最近练习」，不能沿用练习前的列表',
      );
    });

    test('没有会话时 reset 不打扰历史', () async {
      final controller = container.read(practiceControllerProvider.notifier);
      controller.reset();
      await flush();

      expect(history.loadCalls, 0);
    });

    test('作答提交成功后错题总数失效（首页角标能更新）', () async {
      var totalBuilds = 0;
      final counting = ProviderContainer(
        overrides: [
          practiceRepositoryProvider.overrideWithValue(repository),
          preferencesStoreProvider.overrideWithValue(prefs),
          wrongBookTotalProvider.overrideWith((ref) async {
            totalBuilds++;
            return 0;
          }),
        ],
      );
      addTearDown(counting.dispose);
      final subscription = counting.listen(
        wrongBookTotalProvider,
        (_, _) {},
        fireImmediately: true,
      );
      addTearDown(subscription.close);
      await counting.read(wrongBookTotalProvider.future);
      expect(totalBuilds, 1);

      final controller = counting.read(practiceControllerProvider.notifier);
      await controller.createSession(limit: 3);
      controller.toggleAnswer('A');
      await controller.submitCurrentAnswer();
      await flush();
      await counting.read(wrongBookTotalProvider.future);

      expect(totalBuilds, 2, reason: '提交后错题数必须重新取一次');
    });
  });

  group('断点解析（格式漂移一律当没有断点）', () {
    PracticeResume? parse(Map<String, dynamic> json) =>
        PracticeResume.fromJson(json);

    test('已答完（已答记录数 ≥ 总题数）不再恢复', () {
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answers': <Map<String, dynamic>>[
            for (var i = 1; i <= 3; i++)
              <String, dynamic>{'id': '$i', 'correct': true},
          ],
          'nextIndex': 2,
          'total': 3,
          'savedAt': '2026-11-20T10:00:00.000',
        }),
        isNull,
      );
      // 旧格式同样判定
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

    test('sessionId 为空 / total 为 0 / 下标越界都算无效', () {
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
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answers': <Map<String, dynamic>>[],
          'nextIndex': 8,
          'total': 8,
        }),
        isNull,
      );
    });

    test('已答记录重复 / 缺字段都算坏断点', () {
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answers': <Map<String, dynamic>>[
            <String, dynamic>{'id': '1', 'correct': true},
            <String, dynamic>{'id': '1', 'correct': false},
          ],
          'nextIndex': 1,
          'total': 8,
        }),
        isNull,
      );
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answers': <Map<String, dynamic>>[
            <String, dynamic>{'id': '1'},
          ],
          'nextIndex': 1,
          'total': 8,
        }),
        isNull,
      );
      // 有新格式 answers 却没有 nextIndex：无法判断落点，按坏断点处理
      expect(
        parse(<String, dynamic>{
          'sessionId': 's1',
          'answers': <Map<String, dynamic>>[
            <String, dynamic>{'id': '1', 'correct': true},
          ],
          'total': 8,
        }),
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
        'answers': <Map<String, dynamic>>[],
        'nextIndex': 1,
        'total': 8,
      });
      expect(parsed, isNotNull);
      expect(parsed!.mode, 'random');
      expect(parsed.answeredCount, 0);
      expect(parsed.startIndex, 1);
    });
  });
}
