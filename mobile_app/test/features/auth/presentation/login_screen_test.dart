import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/auth/presentation/login_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_auth.dart';
import '../../../support/pump_router.dart';

/// 登录屏的行为契约（不是渲染快照）。
///
/// 守的四条线：
/// 1. **空值拦截不发请求**：拦在 UI 层是为了不让空凭据打到服务端，断言的是
///    `loginCalls == 0`，而不是「弹了个 SnackBar」——删掉 `isEmpty` 分支后
///    请求次数立刻变 1，用例就红；
/// 2. **提交中主按钮禁用**：连点两次不该发两次请求（幂等从入口守住）；
/// 3. **401 与网络失败给不同文案，且都不跳转**：401 是「账号或密码错误」，
///    断网是「网络好像断了」，两者混用会让用户改密码去修 WiFi；
/// 4. **成功后 `replace` 到首页**：`go` 不留返回栈，防止返回键退回登录页。
void main() {
  setUpAll(useFakeSecureStorage);

  late FakeAuthRepository repository;

  setUp(() {
    repository = FakeAuthRepository();
  });

  /// 登录页 + 两个落地页桩。
  Future<GoRouter> pumpLogin(WidgetTester tester) {
    return pumpRouter(
      tester,
      initialLocation: AppRoutes.login,
      routes: <String, WidgetBuilder>{
        AppRoutes.login: (BuildContext context) => const LoginScreen(),
        AppRoutes.dashboard: (BuildContext context) =>
            routeStub(AppRoutes.dashboard),
      },
      overrides: fakeAuth(repository: repository),
    );
  }

  /// 固定推帧，不用 `pumpAndSettle`：提交中会有一个无限动画的
  /// `CircularProgressIndicator`，settle 会超时。
  Future<void> flush(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    // 路由转场（MaterialPage 的 300ms 淡入）要走完，否则旧页还在树上：
    // 「成功跳走」与「失败原地不动」都要在这一帧之后断言。
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  }

  Finder submitButton() => find.byType(FilledButton);

  Future<void> fillForm(WidgetTester tester, {String? username, String? password}) async {
    final fields = find.byType(TextField);
    if (username != null) {
      await tester.enterText(fields.at(0), username);
    }
    if (password != null) {
      await tester.enterText(fields.at(1), password);
    }
    await tester.pump();
  }

  testWidgets('用户名为空：提示且不发请求', (WidgetTester tester) async {
    final router = await pumpLogin(tester);

    await fillForm(tester, password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    expect(find.text('请输入邮箱或用户名'), findsOneWidget);
    expect(
      repository.loginCalls,
      0,
      reason: '空用户名必须在界面上拦住，不能打到服务端',
    );
    expectLocation(router, AppRoutes.login);
  });

  testWidgets('密码为空：提示且不发请求', (WidgetTester tester) async {
    final router = await pumpLogin(tester);

    await fillForm(tester, username: 'cjb');
    await tester.tap(submitButton());
    await flush(tester);

    expect(find.text('请输入密码'), findsOneWidget);
    expect(repository.loginCalls, 0);
    expectLocation(router, AppRoutes.login);
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('提交中：主按钮禁用并显示进度', (WidgetTester tester) async {
    repository.loginGate = Completer<void>();
    await pumpLogin(tester);

    await fillForm(tester, username: 'cjb', password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    final button = tester.widget<FilledButton>(submitButton());
    expect(
      button.onPressed,
      isNull,
      reason: 'loading 时按钮必须禁用，否则连点会发两次登录请求',
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // 收尾：放行挂住的请求，避免测试结束时留下未完成的 Future。
    repository.loginGate!.complete();
    await flush(tester);
  });

  testWidgets('401：文案是「账号或密码错误」且停在登录页', (WidgetTester tester) async {
    final options = RequestOptions(path: '/auth/login');
    repository.loginError = DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response<void>(requestOptions: options, statusCode: 401),
    );
    final router = await pumpLogin(tester);

    await fillForm(tester, username: 'cjb', password: 'bad');
    await tester.tap(submitButton());
    await flush(tester);

    expect(find.text('账号或密码错误'), findsOneWidget);
    expect(
      find.text('登录已过期，请重新登录'),
      findsNothing,
      reason: '登录页的 401 是「密码错」，不是「会话过期」',
    );
    expectLocation(router, AppRoutes.login);
    expect(router.canPop(), isFalse);
  });

  testWidgets('网络失败：文案与 401 不同，且停在登录页', (WidgetTester tester) async {
    repository.loginError = DioException(
      requestOptions: RequestOptions(path: '/auth/login'),
      type: DioExceptionType.connectionError,
    );
    final router = await pumpLogin(tester);

    await fillForm(tester, username: 'cjb', password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    expect(find.text('网络好像断了，请检查网络后重试'), findsOneWidget);
    expect(
      find.text('账号或密码错误'),
      findsNothing,
      reason: '断网不能让用户以为密码打错了',
    );
    expectLocation(router, AppRoutes.login);
  });

  testWidgets('成功：replace 到首页，且不留返回栈', (WidgetTester tester) async {
    final router = await pumpLogin(tester);

    await fillForm(tester, username: 'cjb', password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    expect(repository.loginArgs.single, <String>['cjb', 'pwd123']);
    expectLocation(router, AppRoutes.dashboard);
    expect(stubPage(AppRoutes.dashboard), findsOneWidget);
    expect(
      router.canPop(),
      isFalse,
      reason: '登录成功用 go 替换栈：返回键不该退回登录页',
    );
    expect(find.byType(LoginScreen), findsNothing);
  });
}
