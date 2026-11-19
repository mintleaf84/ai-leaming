import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

/// 统一状态视图的护栏（见 docs/ui-audit-2026-11-20.md #9）。
///
/// 这两个组件替掉了 6 个屏各自的私有实现，所以它们的三件事必须在测试里锁住：
/// 1. 文案/出口按传入渲染（不多不少）；
/// 2. 重试/行动回调真被调用；
/// 3. 有 `Semantics` 标签（改之前全仓 116 个 dart 文件只有 2 处 Semantics）。
void main() {
  Widget wrap(Widget child) {
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) =>
          MaterialApp(
            // 必须挂真实主题：context.colors 取不到会 assert，那正是我们想要的失败方式
            theme: AppTheme.lightTheme,
            home: Scaffold(body: child),
          ),
    );
  }

  group('AppErrorView', () {
    testWidgets('渲染默认标题、说明与重试按钮，点击触发 onRetry', (
      WidgetTester tester,
    ) async {
      int retried = 0;
      await tester.pumpWidget(
        wrap(
          AppErrorView(message: '请检查网络后重试', onRetry: () => retried++),
        ),
      );

      expect(find.text('加载失败'), findsOneWidget);
      expect(find.text('请检查网络后重试'), findsOneWidget);

      await tester.tap(find.text('重试'));
      expect(retried, 1);
    });

    testWidgets('自定义标题与次要出口都生效', (WidgetTester tester) async {
      int retried = 0;
      int secondaries = 0;
      await tester.pumpWidget(
        wrap(
          AppErrorView(
            title: '统计没加载出来',
            message: '稍后再试',
            onRetry: () => retried++,
            secondaryLabel: '返回首页',
            onSecondary: () => secondaries++,
          ),
        ),
      );

      expect(find.text('统计没加载出来'), findsOneWidget);
      await tester.tap(find.text('重试'));
      await tester.tap(find.text('返回首页'));
      expect(retried, 1);
      expect(secondaries, 1);
    });

    testWidgets('带 Semantics 标签（读屏可读）', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(AppErrorView(message: '服务端异常', onRetry: () {})),
      );

      // Semantics 容器把标题与说明合成一句
      expect(
        find.bySemanticsLabel(RegExp('加载失败')),
        findsOneWidget,
      );
    });
  });

  group('AppEmptyView', () {
    testWidgets('只有标题时渲染纯文字版', (WidgetTester tester) async {
      await tester.pumpWidget(wrap(const AppEmptyView(title: '暂无教材')));

      expect(find.text('暂无教材'), findsOneWidget);
      expect(find.byType(TextButton), findsNothing);
    });

    testWidgets('emoji + hint + 行动按钮都渲染，点击触发回调', (
      WidgetTester tester,
    ) async {
      int actions = 0;
      await tester.pumpWidget(
        wrap(
          AppEmptyView(
            title: '暂无练习记录',
            hint: '完成一次练习后会显示在这里',
            emoji: '📚',
            actionLabel: '开始练习',
            onAction: () => actions++,
          ),
        ),
      );

      expect(find.text('📚'), findsOneWidget);
      expect(find.text('完成一次练习后会显示在这里'), findsOneWidget);

      await tester.tap(find.text('开始练习'));
      expect(actions, 1);
    });

    testWidgets('给了 actionLabel 但没给 onAction 时不渲染按钮', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(const AppEmptyView(title: '空', actionLabel: '无回调')),
      );

      expect(find.text('无回调'), findsNothing);
    });

    testWidgets('带 Semantics 标签（标题 + 说明）', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(const AppEmptyView(title: '暂无数据', hint: '换个筛选条件试试')),
      );

      expect(find.bySemanticsLabel(RegExp('暂无数据')), findsOneWidget);
    });
  });
}
