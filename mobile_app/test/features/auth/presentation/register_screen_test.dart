import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/auth/domain/auth_repository.dart';
import 'package:mobile_app/features/auth/presentation/register_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_auth.dart';
import '../../../support/pump_router.dart';

/// 注册屏的行为契约。
///
/// 与登录屏共用「提交中禁用 + 成功落点」两条口径；额外守注册独有的两点：
/// 1. 失败必须**停在注册页**（跳到首页等于让用户以为注册成功、实际没账号）；
/// 2. 「返回」在没有上一页时也要回登录页（`backOrHome` 的 fallback），
///    而不是点了没反应——注册页通常是 `replace` 进来的，栈里只有一页。
void main() {
  setUpAll(useFakeSecureStorage);

  late FakeAuthRepository repository;

  setUp(() {
    repository = FakeAuthRepository();
  });

  Future<GoRouter> pumpRegister(WidgetTester tester) {
    return pumpRouter(
      tester,
      initialLocation: AppRoutes.register,
      routes: <String, WidgetBuilder>{
        AppRoutes.register: (BuildContext context) => const RegisterScreen(),
        AppRoutes.login: (BuildContext context) => routeStub(AppRoutes.login),
        AppRoutes.dashboard: (BuildContext context) =>
            routeStub(AppRoutes.dashboard),
      },
      overrides: fakeAuth(repository: repository),
    );
  }

  /// 固定推帧（不用 `pumpAndSettle`：提交中有一个无限动画的进度圈）。
  Future<void> flush(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  }

  Finder submitButton() => find.byType(FilledButton);

  Future<void> fillForm(
    WidgetTester tester, {
    String username = 'newbie',
    String password = 'pwd123',
  }) async {
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), username);
    await tester.enterText(fields.at(1), password);
    await tester.pump();
  }

  testWidgets('提交中：主按钮禁用并显示进度', (WidgetTester tester) async {
    repository.registerGate = Completer<void>();
    await pumpRegister(tester);

    await fillForm(tester);
    await tester.tap(submitButton());
    await flush(tester);

    expect(repository.registerCalls, 1);
    expect(
      tester.widget<FilledButton>(submitButton()).onPressed,
      isNull,
      reason: 'loading 时按钮必须禁用，否则连点会发两次注册请求',
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    repository.registerGate!.complete();
    await flush(tester);
  });

  testWidgets('成功：replace 到首页，且不留返回栈', (WidgetTester tester) async {
    final router = await pumpRegister(tester);

    await fillForm(tester, username: 'newbie', password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    expect(repository.registerArgs.single, <String>['newbie', 'pwd123']);
    expectLocation(router, AppRoutes.dashboard);
    expect(stubPage(AppRoutes.dashboard), findsOneWidget);
    expect(
      router.canPop(),
      isFalse,
      reason: '注册成功用 go 替换栈：返回键不该退回注册页',
    );
  });

  testWidgets('后端拒绝：提示可见且停在注册页', (WidgetTester tester) async {
    repository.registerError = const AuthException('用户名已存在');
    final router = await pumpRegister(tester);

    await fillForm(tester, username: 'dup', password: 'pwd123');
    await tester.tap(submitButton());
    await flush(tester);

    expect(find.textContaining('用户名已存在'), findsOneWidget);
    expectLocation(router, AppRoutes.register);
    expect(
      find.byType(RegisterScreen),
      findsOneWidget,
      reason: '注册失败必须停在注册页，不能跳到首页',
    );
  });

  testWidgets('返回：没有上一页时回登录页（不是点了没反应）', (WidgetTester tester) async {
    final router = await pumpRegister(tester);

    await tester.tap(find.byTooltip('返回'));
    await flush(tester);

    expectLocation(router, AppRoutes.login);
    expect(stubPage(AppRoutes.login), findsOneWidget);
  });

  testWidgets('「立即登录」链接回登录页', (WidgetTester tester) async {
    final router = await pumpRegister(tester);

    // 富文本链接包在 GestureDetector 里：`find.text` 默认不匹配 RichText。
    final link = find.byWidgetPredicate(
      (Widget w) => w is GestureDetector && w.child is RichText,
    );
    expect(link, findsOneWidget);
    await tester.tap(link);
    await flush(tester);

    expectLocation(router, AppRoutes.login);
  });

  testWidgets('空用户名：界面拦截并提示，不把空凭据发给服务端', (WidgetTester tester) async {
    final router = await pumpRegister(tester);

    await tester.tap(submitButton());
    await flush(tester);

    expect(repository.registerCalls, 0);
    // 输入框的 hint 也叫「请输入用户名」，必须只认 SnackBar 里的那一句。
    expect(
      find.descendant(
        of: find.byType(SnackBar),
        matching: find.text('请输入用户名'),
      ),
      findsOneWidget,
    );
    expectLocation(router, AppRoutes.register);
    expect(find.byType(RegisterScreen), findsOneWidget);
  });

  testWidgets('空密码：界面拦截并提示，不发请求', (WidgetTester tester) async {
    final router = await pumpRegister(tester);

    await tester.enterText(find.byType(TextField).at(0), 'newbie');
    await tester.pump();
    await tester.tap(submitButton());
    await flush(tester);

    expect(repository.registerCalls, 0, reason: '空密码也不该打服务端');
    expect(
      find.descendant(
        of: find.byType(SnackBar),
        matching: find.text('请输入密码'),
      ),
      findsOneWidget,
    );
    expectLocation(router, AppRoutes.register);
  });
}
