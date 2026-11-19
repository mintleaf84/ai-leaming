import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/theme/app_theme.dart';

/// 页面过渡护栏（见 docs/mobile-ui-kit.md D-1）。
///
/// 覆盖两件事：
/// 1. 主题里 Android 用的是预测性返回过渡、iOS 用的是 Cupertino 侧滑；
/// 2. 走 `GoRoute(builder:)` 的默认 MaterialPage 能正常 push / pop
///    （不写自定义 `CustomTransitionPage` 是刻意的——那会绕过 PageTransitionsTheme）。
void main() {
  GoRouter buildRouter() {
    return GoRouter(
      initialLocation: '/a',
      routes: <RouteBase>[
        GoRoute(
          path: '/a',
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Center(child: Text('page-a'))),
        ),
        GoRoute(
          path: '/b',
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Center(child: Text('page-b'))),
        ),
      ],
    );
  }

  /// 与 `lib/main.dart` 的 `ScreenUtilInit` 配置保持一致。
  ///
  /// 注意 `AppTheme.lightTheme` 必须在 builder 内部取：它用了 screenutil 的
  /// `.sp`，初始化之前访问会抛 LateInitializationError。
  Widget wrap(Widget Function(BuildContext context) builder) {
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) => builder(context),
    );
  }

  testWidgets('Android 使用预测性返回过渡，iOS 使用 Cupertino 侧滑', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        (BuildContext context) => MaterialApp(
          theme: AppTheme.lightTheme,
          home: const Scaffold(body: Center(child: Text('home'))),
        ),
      ),
    );

    final ThemeData theme = Theme.of(tester.element(find.text('home')));
    final PageTransitionsTheme transitions = theme.pageTransitionsTheme;

    expect(
      transitions.builders[TargetPlatform.android],
      isA<PredictiveBackPageTransitionsBuilder>(),
    );
    expect(
      transitions.builders[TargetPlatform.iOS],
      isA<CupertinoPageTransitionsBuilder>(),
    );

    // 暗色主题共用同一份过渡配置，避免只改亮色导致的平台差异。
    expect(
      AppTheme.darkTheme.pageTransitionsTheme.builders[TargetPlatform.android],
      isA<PredictiveBackPageTransitionsBuilder>(),
    );
  });

  testWidgets('路由 push / pop 正常切换页面且不抛异常', (WidgetTester tester) async {
    final GoRouter router = buildRouter();

    await tester.pumpWidget(
      wrap(
        (BuildContext context) => MaterialApp.router(
          theme: AppTheme.lightTheme,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('page-a'), findsOneWidget);
    expect(find.text('page-b'), findsNothing);

    router.push('/b');
    await tester.pumpAndSettle();
    expect(find.text('page-b'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('page-a'), findsOneWidget);
    expect(find.text('page-b'), findsNothing);
  });
}
