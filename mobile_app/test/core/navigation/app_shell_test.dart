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
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/practice/presentation/practice_setup_screen.dart';
import 'package:mobile_app/features/recall/presentation/recall_session_screen.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_screen.dart';

import '../../support/fake_providers.dart';
import '../../support/recording_adapter.dart';

/// 底部导航与能力协商（review C8）。
///
/// 守的线：
/// 1. 服务端自述没有 `recall` 时**记忆卡 tab 与首页入口一起消失**（首页藏了、
///    tab 还留着，用户点进去只能撞一个报错）；
/// 2. 隐藏一个 tab 之后，其余 tab 的**分支下标不错位**——错题本仍是分支 3，
///    点它必须进错题本，而不是落到被隐藏的记忆卡分支上；
/// 3. 支持 recall 时四个 tab 原样都在（回归）。
void main() {
  setUpAll(useFakeSecureStorage);

  late RecordingAdapter adapter;

  setUp(() {
    adapter = RecordingAdapter(
      handler: (options) {
        final path = options.uri.path;
        if (path.endsWith('/recall/queue')) {
          return jsonBody(<String, dynamic>{
            'ids': <int>[1],
            'due': 1,
            'fresh': 0,
            'total': 1,
            'estimatedMinutes': 2,
            'streakDays': 1,
          });
        }
        if (path.endsWith('/history')) {
          return jsonBody(<String, dynamic>{
            'items': <Map<String, dynamic>>[],
            'total': 0,
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

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump(const Duration(milliseconds: 350));
  }

  List<Object> overridesWith({required Set<String> features}) {
    return <Object>[
      dioProvider.overrideWithValue(testDio()),
      ...fakeStats(),
      ...fakeWrongBook(),
      ...fakeHistory(),
      ...fakePractice(),
      ...fakePreferences(),
      contractDecisionProvider.overrideWith(
        (ref) async => ContractDecision(
          status: ContractCompat.ok,
          meta: ContractMeta(contractVersion: 1, features: features),
        ),
      ),
    ];
  }

  Future<GoRouter> pumpApp(
    WidgetTester tester, {
    required Set<String> features,
  }) async {
    final router = buildAppRouter(initialLocation: AppRoutes.dashboard);

    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(375, 667);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: overridesWith(features: features).cast(),
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

  Finder tab(String label) => find.byKey(ValueKey<String>('shell_tab_$label'));

  testWidgets('服务端没有 recall：记忆卡 tab 隐藏，其余 tab 分支下标不错位', (tester) async {
    await pumpApp(tester, features: const <String>{'history'});

    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(tab('记忆卡'), findsNothing, reason: '能力协商说不支持就不该有这个 tab');
    // 首页入口同步隐藏（两处共用 recallEntryAvailable）
    expect(find.text('记忆卡'), findsNothing);

    // 隐藏中间一个 tab 之后，错题本仍是分支 3：点它必须进错题本
    await tester.tap(tab('错题本'));
    await settle(tester);
    expect(find.byType(WrongBookScreen), findsOneWidget);
    expect(tab('错题本'), findsOneWidget);

    // 练习仍是分支 1
    await tester.tap(tab('练习'));
    await settle(tester);
    expect(find.byType(PracticeSetupScreen), findsOneWidget);
  });

  testWidgets('服务端支持 recall：四个 tab 原样都在（回归）', (tester) async {
    await pumpApp(tester, features: const <String>{'recall'});

    expect(tab('首页'), findsOneWidget);
    expect(tab('练习'), findsOneWidget);
    expect(tab('记忆卡'), findsOneWidget);
    expect(tab('错题本'), findsOneWidget);

    // 记忆卡 tab 走分支 2
    await tester.tap(tab('记忆卡'));
    await settle(tester);
    expect(find.byType(RecallSessionScreen), findsOneWidget);
  });
}
