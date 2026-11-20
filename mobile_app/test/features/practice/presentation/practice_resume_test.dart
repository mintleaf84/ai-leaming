import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/history/domain/history_item.dart';
import 'package:mobile_app/features/history/presentation/history_provider.dart';
import 'package:mobile_app/shared/events/data_change_events.dart';
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
      'userId': '1',
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
    expect(restored.legacyAnswered, 2, reason: '旧格式的已答前缀必须留下来，否则重写断点会归零');
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
      'userId': '1',
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

  /// 旧格式断点只有「已答数」、没有题号：恢复后 `answers` 为空，
  /// 若落点仍按「第一道未答题」算，恢复即落盘会把进度写回 0（review 二轮 2）。
  test('旧格式断点：恢复后立即落盘进度不丢，答完前缀后的题才前进', () async {
    const key = PreferencesKeys.practiceResume;
    final store = FakePreferencesStore(
      initial: <String, String>{
        key: jsonEncode(<String, dynamic>{
          'sessionId': 'session_9',
          'answered': 2,
          'total': 8,
          'mode': 'random',
          'userId': '1',
          'savedAt': DateTime.now().toIso8601String(),
        }),
      },
    );
    final repo = FakePracticeRepository(
      questions: <Question>[for (var i = 1; i <= 8; i++) fakeQuestion(id: '$i')],
    );
    final fresh = ProviderContainer(
      overrides: [
        practiceRepositoryProvider.overrideWithValue(repo),
        preferencesStoreProvider.overrideWithValue(store),
        historyControllerProvider.overrideWith(
          () => FakeHistoryController(const HistoryListState(items: [])),
        ),
      ],
    );
    addTearDown(fresh.dispose);

    await fresh.read(practiceResumeControllerProvider.notifier).restore();
    final restored = fresh.read(practiceResumeControllerProvider)!;
    expect(restored.nextIndex, 2);

    final controller = fresh.read(practiceControllerProvider.notifier);
    await controller.loadSession(
      restored.sessionId,
      startIndex: restored.startIndex,
      answered: restored.answers,
      legacyAnswered: restored.legacyAnswered,
    );
    await flush();

    expect(fresh.read(practiceControllerProvider).currentIndex, 2);
    expect(
      fresh.read(practiceResumeControllerProvider)!.nextIndex,
      2,
      reason: '续练本身会重写断点：不能把「已答 2 题」覆盖成 0',
    );
    expect(PracticeResume.decode(store.values[key])!.nextIndex, 2);
    expect(PracticeResume.decode(store.values[key])!.legacyAnswered, 2);

    // 答第 3 题（下标 2）后，落点才前进到第 4 题
    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    final saved = fresh.read(practiceResumeControllerProvider)!;
    expect(saved.nextIndex, 3);
    expect(saved.answers.map((a) => a.questionId), <String>['3']);
  });

  /// 在线会话中途断网降级后，断点必须改记 `local_<服务端会话 id>`：
  /// 记服务端 id 的话离线重启会打到一个必然失败的地址（review 二轮 4）。
  test('在线会话断网降级：断点改记 local_ 会话，重启后按原题序续练', () async {
    repository.submitResponse = const <String, dynamic>{
      'isCorrect': true,
      'correctAnswer': 'A',
      'offline': true,
      'persisted': true,
    };
    final controller = container.read(practiceControllerProvider.notifier);
    await controller.createSession(limit: 3);
    await flush();

    controller.toggleAnswer('A');
    await controller.submitCurrentAnswer();
    await flush();

    final state = container.read(practiceControllerProvider);
    expect(state.sessionId, 'local_session_1', reason: '降级后本场就是本地会话');
    expect(state.isOffline, isTrue);
    expect(
      repository.submittedSessionQuestionIds.single,
      <String>['1', '2', '3'],
      reason: '降级时要带上整场题序，本地会话才能按原顺序重建',
    );

    final saved = resume()!;
    expect(saved.sessionId, 'local_session_1');
    expect(saved.sessionId, startsWith('local_'));
    expect(saved.answeredCount, 1);

    // 模拟杀进程重启：新容器、同一份本地存储
    final restarted = ProviderContainer(
      overrides: [
        practiceRepositoryProvider.overrideWithValue(repository),
        preferencesStoreProvider.overrideWithValue(prefs),
        historyControllerProvider.overrideWith(
          () => FakeHistoryController(const HistoryListState(items: [])),
        ),
      ],
    );
    addTearDown(restarted.dispose);

    await restarted.read(practiceResumeControllerProvider.notifier).restore();
    final restored = restarted.read(practiceResumeControllerProvider)!;
    expect(restored.sessionId, 'local_session_1');

    final restartedController = restarted.read(
      practiceControllerProvider.notifier,
    );
    await restartedController.loadSession(
      restored.sessionId,
      startIndex: restored.startIndex,
      answered: restored.answers,
      legacyAnswered: restored.legacyAnswered,
    );

    final reloaded = restarted.read(practiceControllerProvider);
    expect(reloaded.sessionId, 'local_session_1');
    expect(reloaded.isOffline, isTrue);
    expect(
      reloaded.questions.map((q) => q.id),
      <String>['1', '2', '3'],
      reason: '题序完整，断点「第 2 题」才对得上',
    );
    expect(reloaded.currentIndex, 1);
    expect(reloaded.results, <String, bool>{'1': true});
  });

  group('断点归属：设备级 key 不能跨账号（review 二轮 3）', () {
    String resumeJson({String? userId}) => jsonEncode(<String, dynamic>{
      'sessionId': 'session_9',
      'answers': <Map<String, dynamic>>[
        <String, dynamic>{'id': '1', 'correct': true},
      ],
      'nextIndex': 1,
      'total': 8,
      'mode': 'random',
      if (userId != null) 'userId': userId,
      'savedAt': DateTime.now().toIso8601String(),
    });

    test('A 的断点 + 当前登录的是 B：不恢复，且 key 被清掉', () async {
      const key = PreferencesKeys.practiceResume;
      final store = FakePreferencesStore(
        initial: <String, String>{key: resumeJson(userId: '1')},
      );
      // 当前账号换成 B
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 2));
      addTearDown(useFakeSecureStorage);

      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      await fresh.read(practiceResumeControllerProvider.notifier).restore();

      expect(
        fresh.read(practiceResumeControllerProvider),
        isNull,
        reason: '首页不能出现「继续上次练习」——那是 A 的进度',
      );
      expect(store.values[key], '', reason: '跨账号的断点必须就地删除');
    });

    test('同一账号：断点正常恢复', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{
          PreferencesKeys.practiceResume: resumeJson(userId: '1'),
        },
      );
      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      await fresh.read(practiceResumeControllerProvider.notifier).restore();

      final restored = fresh.read(practiceResumeControllerProvider);
      expect(restored, isNotNull);
      expect(restored!.userId, '1');
      expect(restored.nextIndex, 1);
    });

    test('没有 userId 的旧断点无法确认归属：不恢复并清除', () async {
      const key = PreferencesKeys.practiceResume;
      final store = FakePreferencesStore(
        initial: <String, String>{key: resumeJson()},
      );
      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      await fresh.read(practiceResumeControllerProvider.notifier).restore();

      expect(fresh.read(practiceResumeControllerProvider), isNull);
      expect(store.values[key], '');
    });

    test('落盘的断点带上当前账号 id', () async {
      final controller = container.read(practiceControllerProvider.notifier);
      await controller.createSession(limit: 3);
      await flush();

      expect(persisted()!.userId, '1');
    });
  });

  group('本地存储故障不炸练习（断点可丢，练习不能挂）', () {
    test('读盘失败：按「没有断点」处理，不抛', () async {
      final store = FakePreferencesStore(readError: StateError('disk gone'));
      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      await fresh.read(practiceResumeControllerProvider.notifier).restore();

      expect(fresh.read(practiceResumeControllerProvider), isNull);
    });

    test('落盘失败：内存状态照常更新（首页能显示「继续上次练习」）', () async {
      final store = FakePreferencesStore(writeError: StateError('disk full'));
      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      final controller = fresh.read(practiceResumeControllerProvider.notifier);
      await controller.save(
        PracticeResume(
          sessionId: 'session_9',
          answers: const <ResumeAnswer>[],
          nextIndex: 0,
          total: 8,
          userId: '1',
          savedAt: DateTime.now(),
        ),
      );

      expect(
        fresh.read(practiceResumeControllerProvider)?.sessionId,
        'session_9',
        reason: '写盘失败只影响「下次能否续练」，不该把本次练习的状态一起丢掉',
      );
      expect(store.values, isEmpty);
    });

    test('清除失败：内存状态照样清空（作废的入口不能留在首页）', () async {
      final store = FakePreferencesStore(writeError: StateError('disk full'));
      final fresh = ProviderContainer(
        overrides: [preferencesStoreProvider.overrideWithValue(store)],
      );
      addTearDown(fresh.dispose);

      final controller = fresh.read(practiceResumeControllerProvider.notifier);
      await controller.save(
        PracticeResume(
          sessionId: 'session_9',
          answers: const <ResumeAnswer>[],
          nextIndex: 0,
          total: 8,
          userId: '1',
          savedAt: DateTime.now(),
        ),
      );
      expect(fresh.read(practiceResumeControllerProvider), isNotNull);

      await controller.clear();

      expect(fresh.read(practiceResumeControllerProvider), isNull);
    });
  });

  group('练习结束后的首页数据（review B6/B7）', () {
    // 练习结束不再直接调 `historyControllerProvider.loadHistory()`（那会让
    // practice 反向依赖 history 的表现层），而是 bump `historyEpochProvider`；
    // `HistoryController` 自己 listen 并重拉第一页。
    // 「bump 真的触发重拉」由 `history_provider_test.dart` 用真控制器验证，
    // 这里只守产生方：该 bump 的时候 bump、不该打扰的时候不动。
    test('reset bump 历史版本号（首页据此重拉「最近练习」）', () async {
      final controller = container.read(practiceControllerProvider.notifier);
      await controller.createSession(limit: 3);
      await flush();
      final before = container.read(historyEpochProvider);

      controller.reset();
      await flush();

      expect(
        container.read(historyEpochProvider),
        before + 1,
        reason: '练习结束要通知历史重取「最近练习」，不能沿用练习前的列表',
      );
    });

    test('没有会话时 reset 不打扰历史', () async {
      final controller = container.read(practiceControllerProvider.notifier);
      controller.reset();
      await flush();

      expect(container.read(historyEpochProvider), 0);
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
