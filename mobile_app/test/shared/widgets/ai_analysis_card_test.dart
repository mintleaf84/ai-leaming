import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/shared/widgets/ai_analysis_card.dart';

import '../../support/pump_screen.dart';

/// AI 解析卡片冒烟。
///
/// 这个组件的四种输入（什么都没有 / 加载中 / 失败 / 有内容）各自对应一种完全
/// 不同的渲染，最容易出的事故是「加载中显示空白」和「失败后没有出口」。
void main() {
  Widget host(Widget child) =>
      Scaffold(body: SingleChildScrollView(child: child));

  testWidgets('四种输入都不给：整块不占位', (tester) async {
    await pumpScreen(tester, host(const AiAnalysisCard()));

    expect(tester.getSize(find.byType(AiAnalysisCard)), Size.zero);
  });

  testWidgets('加载中：出骨架，不渲染 Markdown 正文', (tester) async {
    await pumpScreen(tester, host(const AiAnalysisCard(isLoading: true)));

    expect(
      find.byWidgetPredicate((widget) => widget is Skeletonizer),
      findsOneWidget,
    );
    expect(find.byType(MarkdownBody), findsNothing);
  });

  testWidgets('有内容：Markdown 正文渲染出来', (tester) async {
    await pumpScreen(
      tester,
      host(const AiAnalysisCard(content: '**结论**：先看定义')),
    );

    expect(find.byType(MarkdownBody), findsOneWidget);
    expect(find.textContaining('结论'), findsOneWidget);
  });

  testWidgets('失败：给重试入口，点了回调（不是只显示一行红字）', (tester) async {
    var retried = 0;
    await pumpScreen(
      tester,
      host(AiAnalysisCard(error: '网络异常', onRetry: () => retried++)),
    );

    expect(find.textContaining('网络异常'), findsOneWidget);
    await tester.tap(find.text('点击重试'));
    expect(retried, 1);
  });

  testWidgets('折叠：给了 onCollapse 才有收起按钮，点击触发回调', (tester) async {
    var collapsed = 0;

    // 没有 onCollapse 时不应该出现收起按钮
    await pumpScreen(tester, host(const AiAnalysisCard(content: '正文')));
    expect(find.byIcon(AppIcons.keyboardArrowUp), findsNothing);

    await pumpScreen(
      tester,
      host(AiAnalysisCard(content: '正文', onCollapse: () => collapsed++)),
    );
    final collapse = find.byIcon(AppIcons.keyboardArrowUp);
    expect(collapse, findsOneWidget);

    await tester.tap(collapse);
    expect(collapsed, 1);
  });
}
