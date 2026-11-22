import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/sync/sync_providers.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/domain/practice_repository.dart';
import 'package:mobile_app/features/practice/domain/practice_session.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/question_prefetch_provider.dart';
import 'package:mobile_app/features/practice/presentation/widgets/question_prefetch_panel.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../../support/ffi_db.dart';
import '../../../support/pump_screen.dart';

/// 题库预下载：断了能续、完成时整库时间戳统一、设置页三态可辨。
///
/// 守的线：
/// 1. **中断后从断点继续**：失败/暂停时已拉页数落盘，下次只拉剩下的页——
///    否则 1600+ 题每断一次就从头再来，用户永远下不完；
/// 2. **完成时统一 `fetched_at`**：逐页写 `now` 会让先下的页先过期，
///    用户刚下完整库却抽不到前面下的题；
/// 3. **空题库不算成功**：服务端 0 题时不 +1 版本，也不显示「已下载」；
/// 4. 界面三态（未下载 / 下载中 / 完成）文案来自状态，不是写死的。
void main() {
  setUpAll(setUpFfiDatabaseFactory);

  group('控制器', () {
    late Database db;
    late LocalPracticeStore store;
    late _PagedPracticeRepository repository;
    late ProviderContainer container;

    setUp(() async {
      db = await openMemoryDb();
      store = LocalPracticeStore(db: Future<Database>.value(db));
      repository = _PagedPracticeRepository(total: 250);
      container = ProviderContainer(
        overrides: [
          localPracticeStoreProvider.overrideWithValue(store),
          practiceRepositoryProvider.overrideWithValue(repository),
        ],
      );
    });

    tearDown(() async {
      container.dispose();
      await db.close();
    });

    QuestionPrefetchController controller() =>
        container.read(questionPrefetchControllerProvider.notifier);

    test('首次下载：逐页拉取，完成后整库 fetched_at 统一且版本 +1', () async {
      final prefetch = controller();
      await prefetch.restore();
      expect(container.read(questionPrefetchControllerProvider).status,
          PrefetchStatus.idle);

      await prefetch.start();

      final state = container.read(questionPrefetchControllerProvider);
      expect(repository.requestedPages, <int>[1, 2, 3]);
      expect(state.status, PrefetchStatus.done);
      expect(state.pagesDone, 3);
      expect(state.totalPages, 3);
      expect(state.serverTotal, 250);
      expect(state.localCount, 250);
      expect(state.version, 1);
      expect(state.versionLabel, 'v1');

      // 整库只有一个 fetched_at：不然「先下的页」会比「后下的页」早过期。
      final rows = await db.rawQuery(
        'SELECT DISTINCT fetched_at FROM cached_questions',
      );
      expect(rows, hasLength(1));
      expect(await store.getMeta(QuestionPrefetchController.versionMetaKey), '1');
    });

    test('中断后从断点继续：第二次只请求剩下的页', () async {
      repository.failOnPage = 2;
      final prefetch = controller();
      await prefetch.restore();

      await prefetch.start();
      var state = container.read(questionPrefetchControllerProvider);
      expect(state.status, PrefetchStatus.failed);
      expect(state.pagesDone, 1);
      expect(state.error, isNotNull);
      expect(state.localCount, 100, reason: '第 1 页的 100 题已落库');
      expect(state.isPartial, isTrue);

      // 进度已落盘：模拟「换了一次界面/重启」——下次读到的断点一致。
      final progressRaw =
          await store.getMeta(QuestionPrefetchController.progressMetaKey);
      expect(progressRaw, contains('"pagesDone":1'));

      repository.requestedPages.clear();
      await prefetch.start();

      state = container.read(questionPrefetchControllerProvider);
      expect(state.status, PrefetchStatus.done);
      expect(
        repository.requestedPages,
        <int>[2, 3],
        reason: '从断点续传，不重拉第 1 页',
      );
      expect(state.localCount, 250);
      expect(state.pagesDone, 3);
    });

    test('用户中断：保留断点回到可继续状态，不报错', () async {
      final prefetch = controller();
      await prefetch.restore();

      final running = prefetch.start();
      // 第一页请求还没回来就按下暂停：当前页会跑完，然后停在页边界。
      prefetch.cancel();
      await running;

      final state = container.read(questionPrefetchControllerProvider);
      expect(state.status, PrefetchStatus.idle);
      expect(state.error, isNull);
      expect(state.pagesDone, 1);
      expect(state.isPartial, isTrue);
    });

    test('服务端题库为空：不显示完成，也不 +1 版本', () async {
      repository.total = 0;

      final prefetch = controller();
      await prefetch.restore();
      await prefetch.start();

      final state = container.read(questionPrefetchControllerProvider);
      expect(state.status, PrefetchStatus.failed);
      expect(state.error, contains('题库为空'));
      expect(state.version, 0);
      expect(await store.getMeta(QuestionPrefetchController.versionMetaKey), isNull);
    });
  });

  group('设置页面板三态', () {
    Widget host() => const Scaffold(
      body: SafeArea(child: SingleChildScrollView(child: QuestionPrefetchPanel())),
    );

    testWidgets('未下载：显示未下载与服务端未知', (tester) async {
      await pumpScreen(
        tester,
        host(),
        overrides: <Object>[
          questionPrefetchControllerProvider.overrideWith(
            () => _FakePrefetchController(const QuestionPrefetchState()),
          ),
        ],
      );

      expect(find.text('题库预下载'), findsOneWidget);
      expect(find.text('未下载'), findsOneWidget);
      expect(find.text('本地 0 题 / 服务端 未获取 题 / 版本 v0'), findsOneWidget);
      expect(find.text('开始下载'), findsOneWidget);
    });

    testWidgets('下载中：显示进度页数与暂停入口', (tester) async {
      await pumpScreen(
        tester,
        host(),
        overrides: <Object>[
          questionPrefetchControllerProvider.overrideWith(
            () => _FakePrefetchController(
              const QuestionPrefetchState(
                status: PrefetchStatus.running,
                localCount: 100,
                serverTotal: 250,
                pagesDone: 1,
                totalPages: 3,
              ),
            ),
          ),
        ],
      );

      expect(find.text('下载中 1/3 页'), findsOneWidget);
      expect(find.text('本地 100 题 / 服务端 250 题 / 版本 v0'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('暂停'), findsOneWidget);
    });

    testWidgets('完成：显示本地/服务端/版本与重新下载入口', (tester) async {
      await pumpScreen(
        tester,
        host(),
        overrides: <Object>[
          questionPrefetchControllerProvider.overrideWith(
            () => _FakePrefetchController(
              const QuestionPrefetchState(
                status: PrefetchStatus.done,
                localCount: 250,
                serverTotal: 250,
                version: 2,
                pagesDone: 3,
                totalPages: 3,
              ),
            ),
          ),
        ],
      );

      expect(find.text('已下载'), findsOneWidget);
      expect(find.text('本地 250 题 / 服务端 250 题 / 版本 v2'), findsOneWidget);
      expect(find.text('重新下载'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });
  });
}

/// 可翻页的仓库替身：按 `page`/`limit` 切片，并在指定页抛超时（模拟断网）。
class _PagedPracticeRepository implements PracticeRepository {
  _PagedPracticeRepository({required this.total});

  int total;
  int? failOnPage;
  final List<int> requestedPages = <int>[];

  @override
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  }) async {
    final pageNumber = page ?? 1;
    requestedPages.add(pageNumber);
    if (failOnPage == pageNumber) {
      failOnPage = null;
      throw TimeoutException('模拟断网');
    }
    final pageSize = limit ?? 20;
    final start = (pageNumber - 1) * pageSize;
    final end = min(start + pageSize, total);
    final items = <Question>[
      for (var index = start; index < end; index++)
        Question(
          id: '${index + 1}',
          content: '题面 ${index + 1}',
          options: const <String>['A', 'B'],
          answer: 'A',
        ),
    ];
    return QuestionListResponse(items: items, total: total);
  }

  @override
  Future<Question> getQuestionDetail(String id) async =>
      Question(id: id, content: '题面', options: const <String>['A', 'B']);

  @override
  Future<PracticeSession> createSession({
    required int limit,
    String mode = 'random',
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<PracticeSession> getSession(String sessionId) async {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
    String? mode,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<FirstPrinciplesResponse> analyzeFirstPrinciples({
    required String questionContent,
    required String correctAnswer,
    String? explanation,
    String? wrongAnswer,
  }) async {
    throw UnimplementedError();
  }
}

class _FakePrefetchController extends QuestionPrefetchController {
  _FakePrefetchController(this.initial);

  final QuestionPrefetchState initial;

  @override
  QuestionPrefetchState build() => initial;
}
