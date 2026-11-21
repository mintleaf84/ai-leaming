import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/theme/app_theme.dart';

/// 页面过渡护栏（见 docs/mobile-ui-kit.md D-1 与 core/navigation/app_nav.dart）。
///
/// 断言的是**显式配置**，不是"有没有值"：
/// `PageTransitionsTheme` 自带一套默认 builder（Android/Windows 默认 Zoom、
/// iOS 默认 Cupertino），所以只断言 `isNotNull` 的话，把我们的配置整段删掉
/// 测试照样绿。这里逐个平台断言**具体类型** —— 它们与默认值不同，删配置就会红。
///
/// Android 用 `PredictiveBackPageTransitionsBuilder`：官方文档写明它在该平台
/// 不支持预测性返回时**回落 `FadeForwardsPageTransitionsBuilder`**，所以推入观感
/// 与 FadeForwards 一致，额外只在支持时提供返回手势预览。
///
/// 本文件只管"主题配置"；生产路由本身的形状（不得改用 CustomTransitionPage）
/// 由 `test/navigation_rules_test.dart` 的源码扫描负责。
void main() {
  /// 需要显式指定过渡的平台，以及各自应有的 builder。
  /// Fuchsia 不列：不构建、也不该为它维护配置。
  const expected = <TargetPlatform, Type>{
    TargetPlatform.android: PredictiveBackPageTransitionsBuilder,
    TargetPlatform.windows: FadeForwardsPageTransitionsBuilder,
    TargetPlatform.linux: FadeForwardsPageTransitionsBuilder,
    TargetPlatform.iOS: CupertinoPageTransitionsBuilder,
    TargetPlatform.macOS: CupertinoPageTransitionsBuilder,
  };

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
  /// `AppTheme` 里用了 `.sp`，初始化之前读取会抛 LateInitializationError。
  Widget wrap(Widget Function(BuildContext context) builder) {
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) => builder(context),
    );
  }

  testWidgets('每个支持的平台都显式配置了过渡（类型与 SDK 默认值不同）', (
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

    final PageTransitionsTheme light =
        Theme.of(tester.element(find.text('home'))).pageTransitionsTheme;
    final PageTransitionsTheme dark = AppTheme.darkTheme.pageTransitionsTheme;

    expected.forEach((platform, builderType) {
      expect(
        light.builders[platform]?.runtimeType,
        builderType,
        reason: '$platform 的亮色过渡不是显式配置的类型（$builderType）',
      );
      // 亮暗两套必须一致：只改一套是这类配置最常见的漏改
      expect(
        dark.builders[platform]?.runtimeType,
        builderType,
        reason: '$platform 的暗色过渡与亮色不一致（或没配）',
      );
    });
  });

  testWidgets('GoRoute(builder) 走主题过渡：push / pop 正常切换', (
    WidgetTester tester,
  ) async {
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

    // push 返回的 Future 在页面 pop 时才完成：显式声明"不等它"，
    // 否则 unawaited_futures 会报 lint
    unawaited(router.push('/b'));
    await tester.pumpAndSettle();
    expect(find.text('page-b'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('page-a'), findsOneWidget);
    expect(find.text('page-b'), findsNothing);
  });
}
