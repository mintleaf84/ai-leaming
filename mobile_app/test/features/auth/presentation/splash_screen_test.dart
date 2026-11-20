import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/auth/presentation/splash_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_auth.dart';
import '../../../support/pump_router.dart';

/// 启动屏只做一件事：**决定第一屏是谁**。
///
/// 三条落点契约（`TokenUtil.isExpired` 的单测已覆盖判定本身，这里只测落点）：
/// - 有有效 token → 首页；
/// - 没有 token → 登录页；
/// - 有但已过期 → 登录页，**并且清掉残留 token**（否则进主界面处处 401）；
/// 另加一条兜底：读 token 抛异常也要落到登录页，不能白屏卡在启动动画。
void main() {
  setUpAll(useFakeSecureStorage);

  late FakeAuthRepository repository;

  setUp(() {
    repository = FakeAuthRepository();
  });

  Future<GoRouter> pumpSplash(WidgetTester tester) {
    return pumpRouter(
      tester,
      initialLocation: AppRoutes.splash,
      routes: <String, WidgetBuilder>{
        AppRoutes.splash: (BuildContext context) => const SplashScreen(),
        AppRoutes.login: (BuildContext context) => routeStub(AppRoutes.login),
        AppRoutes.dashboard: (BuildContext context) =>
            routeStub(AppRoutes.dashboard),
      },
      overrides: fakeAuth(repository: repository),
    );
  }

  /// 推过启动屏的 500ms 视觉延迟 + 路由转场。
  ///
  /// 不用 `pumpAndSettle`：启动屏上的 `CircularProgressIndicator` 是无限动画，
  /// settle 会一直等到超时。
  Future<void> boot(WidgetTester tester) async {
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  }

  testWidgets('启动时先显示启动屏（还没决定落点）', (WidgetTester tester) async {
    final router = await pumpSplash(tester);

    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
      currentLocation(router),
      AppRoutes.splash,
      reason: '读 token 之前不能先跳走（否则会闪一下登录页）',
    );

    // 收尾：把 500ms 定时器跑完，否则测试结束时会有 pending timer 断言。
    await boot(tester);
  });

  testWidgets('有有效 token：去首页', (WidgetTester tester) async {
    repository.token = fakeJwt();
    final router = await pumpSplash(tester);

    await boot(tester);

    expectLocation(router, AppRoutes.dashboard);
    expect(stubPage(AppRoutes.dashboard), findsOneWidget);
    expect(
      repository.logoutCalls,
      0,
      reason: 'token 有效时不能清掉它，否则用户每次启动都要重登',
    );
  });

  testWidgets('没有 token：去登录页', (WidgetTester tester) async {
    repository.token = null;
    final router = await pumpSplash(tester);

    await boot(tester);

    expectLocation(router, AppRoutes.login);
    expect(stubPage(AppRoutes.login), findsOneWidget);
  });

  testWidgets('token 已过期：去登录页并清掉残留 token', (WidgetTester tester) async {
    repository.token = expiredJwt();
    final router = await pumpSplash(tester);

    await boot(tester);

    expectLocation(router, AppRoutes.login);
    expect(
      repository.logoutCalls,
      1,
      reason: '过期 token 必须清掉：带着废 token 进主界面会处处 401',
    );
    expect(repository.token, isNull);
  });

  testWidgets('读 token 抛异常：兜底去登录页（不白屏）', (WidgetTester tester) async {
    repository.getTokenError = Exception('平台通道不可用');
    final router = await pumpSplash(tester);

    await boot(tester);

    expectLocation(router, AppRoutes.login);
    expect(stubPage(AppRoutes.login), findsOneWidget);
  });
}
