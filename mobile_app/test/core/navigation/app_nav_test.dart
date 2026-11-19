import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';

/// `AppNav` 是 go_router 的包装层，三个方法对应三种**导航意图**，不是三个
/// "调用转发"。这个测试守的线：
///
/// 1. `pushDetail` 必须真的 `push`（留返回栈）：它存在的全部理由就是修掉
///    "详情页用 go 进来 → 返回键直接退出 App"；如果哪天有人把它改回 `go`，
///    「返回后回到列表页」这条用例立刻红；
/// 2. `pushDetail` 的 `onReturn` 必须在页面真正被弹回之后触发：列表页靠它失效
///    缓存，早一帧或永不触发都会让用户看到旧数据；
/// 3. `replace` 必须不留返回栈（登录成功、练习结束不该能回退到登录页/答题页）；
/// 4. `backOrHome` 在**没有上一页**时要回 fallback，而不是 `pop()` 抛
///    `GoError`（`/practice` 可能是被 replace 进来的，此时栈里只有一页）。
///
/// 注意：go_router 自己也有 `BuildContext.replace`，所以这里统一用显式扩展
/// 调用 `AppNav(context).xxx` —— 顺带也证明了被测的确实是本项目的扩展，而不是
/// go_router 的同名方法。
void main() {
  /// 目标页把收到的 `extra` 渲染出来，用来断言 extra 没在中途丢掉。
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
          builder: (BuildContext context, GoRouterState state) => Scaffold(
            body: Center(child: Text('page-b:${state.extra ?? 'no-extra'}')),
          ),
        ),
        GoRoute(
          path: '/dashboard',
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Center(child: Text('page-dashboard'))),
        ),
      ],
    );
  }

  Future<GoRouter> pumpApp(WidgetTester tester) async {
    final router = buildRouter();
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(find.text('page-a'), findsOneWidget);
    return router;
  }

  /// 当前**在台上**的页面 context（被压栈的上一页是 offstage，finder 默认跳过）。
  BuildContext currentContext(WidgetTester tester) =>
      tester.element(find.textContaining('page-').first);

  group('pushDetail：进入下一层，留返回栈', () {
    testWidgets('push 后能 backOrHome 回到上一页（不是退出 App）', (
      WidgetTester tester,
    ) async {
      final router = await pumpApp(tester);

      AppNav(currentContext(tester)).pushDetail('/b');
      await tester.pumpAndSettle();

      expect(find.text('page-b:no-extra'), findsOneWidget);
      expect(find.text('page-a'), findsNothing);

      expect(
        router.canPop(),
        isTrue,
        reason: 'pushDetail 必须留返回栈；退回 go 会让系统返回键直接退出 App',
      );

      AppNav(currentContext(tester)).backOrHome();
      await tester.pumpAndSettle();

      expect(find.text('page-a'), findsOneWidget);
    });

    testWidgets('extra 原样传给目标页', (WidgetTester tester) async {
      await pumpApp(tester);

      AppNav(currentContext(tester)).pushDetail('/b', extra: 'session-42');
      await tester.pumpAndSettle();

      expect(find.text('page-b:session-42'), findsOneWidget);
    });

    testWidgets('onReturn 在页面被弹回之后才触发，且只触发一次', (WidgetTester tester) async {
      await pumpApp(tester);

      var returned = 0;
      AppNav(
        currentContext(tester),
      ).pushDetail('/b', onReturn: () => returned++);
      await tester.pumpAndSettle();

      // 详情页还挂着：此时不能失效列表缓存，否则返回时会闪一下再重拉。
      expect(returned, 0, reason: '页面仍在栈上时不该触发 onReturn');

      AppNav(currentContext(tester)).backOrHome();
      await tester.pumpAndSettle();

      expect(returned, 1);
      expect(find.text('page-a'), findsOneWidget);
    });
  });

  group('replace：替换当前位置，不留返回栈', () {
    testWidgets('replace 后栈里只有一页，backOrHome 直接回首页', (
      WidgetTester tester,
    ) async {
      final router = await pumpApp(tester);

      AppNav(currentContext(tester)).replace('/b');
      await tester.pumpAndSettle();

      expect(find.text('page-b:no-extra'), findsOneWidget);

      expect(
        router.canPop(),
        isFalse,
        reason: 'replace 的语义就是「不该回退」，留下返回栈等于允许退回登录页',
      );

      AppNav(currentContext(tester)).backOrHome();
      await tester.pumpAndSettle();

      expect(find.text('page-dashboard'), findsOneWidget);
      expect(find.text('page-a'), findsNothing);
    });

    testWidgets('extra 同样经 replace 传下去', (WidgetTester tester) async {
      await pumpApp(tester);

      AppNav(currentContext(tester)).replace('/b', extra: 7);
      await tester.pumpAndSettle();

      expect(find.text('page-b:7'), findsOneWidget);
    });
  });

  group('backOrHome：永远不会"点了没反应"', () {
    testWidgets('没有上一页时回默认 fallback（首页）', (WidgetTester tester) async {
      final router = await pumpApp(tester);

      expect(router.canPop(), isFalse);

      // 不抛 GoError，也不原地不动。
      AppNav(currentContext(tester)).backOrHome();
      await tester.pumpAndSettle();

      expect(find.text('page-dashboard'), findsOneWidget);
    });

    testWidgets('可以指定 fallback', (WidgetTester tester) async {
      await pumpApp(tester);

      AppNav(currentContext(tester)).backOrHome(fallback: '/b');
      await tester.pumpAndSettle();

      expect(find.text('page-b:no-extra'), findsOneWidget);
    });
  });
}
