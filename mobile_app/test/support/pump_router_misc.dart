import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/app_router.dart';
import 'package:mobile_app/core/theme/app_theme.dart';

/// 需要**真路由**的屏级用例（导航落点、清栈、详情参数）的统一入口。
///
/// `pumpScreen(...)` 的 `MaterialApp(home: ...)` 没有 GoRouter，屏里一调
/// `context.pushDetail(...)` / `context.replace(...)` 就会抛「找不到 GoRouter」。
/// 这里复用生产的 [buildAppRouter]（测试里必须新建实例：全局 `appRouter` 是
/// 进程内单例，用例之间会互相污染），其余装配口径与 `pump_screen.dart` 一致。
///
/// 不要用 `pumpAndSettle`：结果页有 500ms 延迟庆祝、历史页有骨架动画，
/// 无限/延迟动画会让它一直等下去。这里固定推帧。
Future<GoRouter> pumpRouter(
  WidgetTester tester, {
  required String initialLocation,
  List<Object> overrides = const <Object>[],
  Size size = const Size(375, 667),
}) async {
  final router = buildAppRouter(initialLocation: initialLocation);

  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides.cast(),
      child: ScreenUtilInit(
        designSize: size,
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (BuildContext context, Widget? _) => MaterialApp.router(
          theme: AppTheme.lightTheme,
          routerConfig: router,
        ),
      ),
    ),
  );
  await settleRouter(tester);
  return router;
}

/// 推几帧到稳态：go_router 的 redirect 是 async（要读一次 token），
/// 屏自身还有「挂载即发请求」的一跳微任务。
Future<void> settleRouter(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}
