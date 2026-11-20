import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/theme/app_theme.dart';

/// 带 `GoRouter` 的屏挂载入口（`pump_screen.dart` 的 Router 版）。
///
/// 为什么不直接复用 `pumpScreen`：它用 `MaterialApp(home:)`，树里没有
/// `GoRouter`，而被测屏的跳转走 `context.replace(...)`（= `GoRouter.go`），
/// 在那种树里会抛 `No GoRouter found in context`。改 `pumpScreen` 会影响
/// 其它 lane 的几十个文件，所以这一层单独放这里。
///
/// 为什么落地断言要看 `router.routerDelegate.currentConfiguration.uri`：
/// 「登录成功后 `replace` 到首页」这条契约里，`replace` 的语义是**不留返回栈**。
/// 只断言「跳出登录页」区分不了 `push` 和 `go`，所以要同时看当前 uri 和
/// `router.canPop()`。
Future<GoRouter> pumpRouter(
  WidgetTester tester, {
  required String initialLocation,
  required Map<String, WidgetBuilder> routes,
  List<Object> overrides = const <Object>[],
  double textScale = 1.0,
  double viewInsetsBottom = 0,
}) async {
  // 与 pumpScreen 同一套版式口径：设计稿尺寸 = 测试窗口，缩放系数 1.0。
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(375, 667);
  tester.view.viewInsets = FakeViewPadding(bottom: viewInsetsBottom);
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: initialLocation,
    routes: <RouteBase>[
      for (final MapEntry<String, WidgetBuilder> entry in routes.entries)
        GoRoute(
          path: entry.key,
          builder: (BuildContext context, GoRouterState state) =>
              entry.value(context),
        ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides.cast(),
      child: ScreenUtilInit(
        designSize: const Size(375, 667),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (BuildContext context, Widget? _) => MaterialApp.router(
          theme: AppTheme.lightTheme,
          routerConfig: router,
          builder: (BuildContext context, Widget? appChild) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: appChild ?? const SizedBox.shrink(),
          ),
        ),
      ),
    ),
  );

  await tester.pump();
  return router;
}

/// 落地页桩：把「当前落在哪条路径」变成可 find 的 key。
///
/// 用 key 而不是文案：文案是产品口径，改一句就得改测试；key 只说「这是
/// `/dashboard` 这一页」，断言的是路由结果，不是页面内容。
Widget routeStub(String path, {String? label}) {
  return Scaffold(
    key: ValueKey<String>('route:$path'),
    body: Center(child: Text(label ?? 'stub:$path')),
  );
}

/// 当前路由路径（不含 query）。
String currentLocation(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.path;

/// 断言「当前路由是 [path]」。
///
/// 只看 uri 不看文案：断言的是导航结果，不是页面内容。需要同时证明
/// 「目标页真的在台上」时用 [stubPage]（只对 `routeStub` 造的落地页有效）。
void expectLocation(GoRouter router, String path) {
  expect(currentLocation(router), path);
}

/// `routeStub(path)` 造出来的落地页 finder。
Finder stubPage(String path) => find.byKey(ValueKey<String>('route:$path'));
