import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/app_router.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/navigation/app_shell.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_screen.dart';
import 'package:mobile_app/features/practice/presentation/practice_setup_screen.dart';
import 'package:mobile_app/features/recall/presentation/recall_session_screen.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_screen.dart';

import '../../support/fake_providers.dart';
import '../../support/recording_adapter.dart';

/// 备考主路径的**导航级**用例（审计 §25 F2/F3/F5）。
///
/// 为什么不用 `pumpScreen`：F2/F3 断言的是「点了之后到了哪一屏」，
/// 那必须有真路由。这里用 `buildAppRouter()` 造一份干净的路由（全局
/// `appRouter` 是单例，用例之间会互相污染），其余数据全部走假仓库。
///
/// 守的三条线：
/// 1. 四个 tab 两两可达，且**切 tab 不堆栈**（`canPop()` 在 tab 根页为 false，
///    返回键退出 App 而不是回上一个 tab）；
/// 2. 待办「今日还需练习 N 题」点了直接出第 1 题，不经过配置页；
/// 3. 断点存在时首页出「继续上次练习」，点了落到那一场的断点题。
void main() {
  setUpAll(useFakeSecureStorage);

  late RecordingAdapter adapter;

  setUp(() {
    adapter = RecordingAdapter(
      handler: (options) {
        final path = options.uri.path;
        if (path.endsWith('/recall/queue')) {
          return jsonBody(<String, dynamic>{
            'ids': <int>[1, 2],
            'due': 2,
            'fresh': 0,
            'total': 2,
            'estimatedMinutes': 4,
            'streakDays': 1,
          });
        }
        if (path.endsWith('/history')) {
          return jsonBody(<String, dynamic>{
            'items': <Map<String, dynamic>>[
              <String, dynamic>{
                'id': 'session_1',
                'sessionName': '综合练习',
                'totalQuestions': 10,
                'correctCount': 7,
                'createdAt': DateTime.now().toIso8601String(),
                'accuracy': 70,
              },
            ],
            'total': 1,
            'totalPages': 1,
          });
        }
        return jsonBody(const <String, dynamic>{});
      },
    );
  });

  Dio testDio() {
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local/api'));
    dio.httpClientAdapter = adapter;
    return dio;
  }

  /// 首帧之后还有 redirect / 挂载即发请求两跳异步。这里不用 `pumpAndSettle`：
  /// 有的屏在加载态跑着无限循环的骨架动画，`pumpAndSettle` 会一直等下去。
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump(const Duration(milliseconds: 350));
  }

  /// 挂一份真路由 + 全部假数据。返回路由实例，用来断言 `canPop()`。
  Future<GoRouter> pumpApp(
    WidgetTester tester, {
    List<Object> overrides = const <Object>[],
    String initialLocation = AppRoutes.dashboard,
  }) async {
    final router = buildAppRouter(initialLocation: initialLocation);

    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(375, 667);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides.cast(),
        child: ScreenUtilInit(
          designSize: const Size(375, 667),
          minTextAdapt: true,
          splitScreenMode: true,
          builder: (context, _) => MaterialApp.router(
            theme: AppTheme.lightTheme,
            routerConfig: router,
          ),
        ),
      ),
    );
    await settle(tester);
    return router;
  }

  List<Object> baseOverrides({
    Map<String, String>? preferences,
    FakePracticeRepository? practice,
  }) {
    return <Object>[
      dioProvider.overrideWithValue(testDio()),
      ...fakeStats(stats: fakeLearningStats(todayCount: 12, todayCorrect: 9)),
      contractDecisionProvider.overrideWith(
        (ref) async => const ContractDecision(
          status: ContractCompat.ok,
          meta: ContractMeta(
            contractVersion: 1,
            features: <String>{'recall'},
          ),
        ),
      ),
      ...fakeWrongBook(stats: const WrongBookStats(total: 24)),
      ...fakePractice(repository: practice),
      ...fakePreferences(initial: preferences),
    ];
  }

  Finder tab(String label) => find.byKey(ValueKey<String>('shell_tab_$label'));

  testWidgets('F2：四个 tab 两两可达，切 tab 不堆栈', (tester) async {
    final router = await pumpApp(tester, overrides: baseOverrides());

    // 起点：首页 tab
    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(router.canPop(), isFalse, reason: 'tab 根页返回键应退出 App');

    await tester.tap(tab('练习'));
    await settle(tester);
    expect(find.byType(PracticeSetupScreen), findsOneWidget);
    expect(router.canPop(), isFalse);

    await tester.tap(tab('记忆卡'));
    await settle(tester);
    expect(find.byType(RecallSessionScreen), findsOneWidget);
    expect(router.canPop(), isFalse);

    await tester.tap(tab('错题本'));
    await settle(tester);
    expect(find.byType(WrongBookScreen), findsOneWidget);
    expect(router.canPop(), isFalse);

    // 回到首页：四个 tab 走完一圈仍是一层栈
    await tester.tap(tab('首页'));
    await settle(tester);
    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(router.canPop(), isFalse);

    // 卡片入口仍然走 pushDetail：盖在 shell 之上，**不会**把 shell 再套一层
    // （套一层就会出现两条底部导航）。
    final wrongCard = find.text('我的错题');
    await tester.ensureVisible(wrongCard);
    await settle(tester);
    await tester.tap(wrongCard);
    await settle(tester);
    expect(find.byType(WrongBookScreen), findsOneWidget);
    expect(find.byType(AppShell), findsOneWidget, reason: 'push 不应嵌套 shell');
    expect(router.canPop(), isTrue);
  });

  testWidgets('F3：点待办直接出第 1 题，不经过配置页', (tester) async {
    final practice = FakePracticeRepository(
      questions: <Question>[
        for (var i = 1; i <= 8; i++)
          fakeQuestion(id: '$i', content: '第 $i 题：下列说法正确的是？'),
      ],
    );
    final router = await pumpApp(
      tester,
      overrides: baseOverrides(practice: practice),
    );

    // 今日已练 12 题 → 还差 8 题
    final todo = find.text('今日还需练习 8 题');
    expect(todo, findsOneWidget);
    await tester.ensureVisible(todo);
    await settle(tester);
    await tester.tap(todo);
    await settle(tester);

    expect(find.byType(PracticeScreen), findsOneWidget);
    expect(find.text('配置练习'), findsNothing, reason: '不该再经过 setup 页');
    // limit 跟着 remaining 走：8 题
    expect(find.text('1 / 8'), findsOneWidget);
    expect(router.canPop(), isTrue, reason: '练习页是压在 shell 上的一层，可返回');
  });

  testWidgets('F5：有断点时首页出「继续上次练习」，点了落到断点题', (tester) async {
    final resume = jsonEncode(<String, dynamic>{
      'sessionId': 'session_9',
      'answers': <Map<String, dynamic>>[
        <String, dynamic>{'id': '1', 'correct': true},
        <String, dynamic>{'id': '2', 'correct': false},
      ],
      'nextIndex': 2,
      'total': 8,
      'mode': 'random',
      'savedAt': DateTime.now().toIso8601String(),
    });
    final practice = FakePracticeRepository(
      questions: <Question>[
        for (var i = 1; i <= 8; i++)
          fakeQuestion(id: '$i', content: '第 $i 题：下列说法正确的是？'),
      ],
    );

    await pumpApp(
      tester,
      overrides: baseOverrides(
        practice: practice,
        preferences: <String, String>{
          PreferencesKeys.practiceResume: resume,
        },
      ),
    );

    final resumeEntry = find.text('继续上次练习');
    expect(resumeEntry, findsOneWidget, reason: '杀进程重开后应能续练');

    await tester.ensureVisible(resumeEntry);
    await settle(tester);
    await tester.tap(resumeEntry);
    await settle(tester);

    expect(find.byType(PracticeScreen), findsOneWidget);
    // 进的是断点里那一场，且从第 3 题接着做（已答 2 题）
    expect(practice.loadedSessions, contains('session_9'));
    expect(find.text('3 / 8'), findsOneWidget);
  });
}
