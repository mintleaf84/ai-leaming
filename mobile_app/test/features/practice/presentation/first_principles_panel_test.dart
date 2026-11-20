import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/presentation/widgets/first_principles_panel.dart';

import '../../../support/fakes_first_principles.dart';
import '../../../support/pump_screen.dart';

/// 这个面板守的是**分支顺序**与**取哪一份数据**，不是文案：
///
/// 1. `isAnalyzing` 优先于「已有响应/空态」——生成中就只能是加载态，
///    否则用户会看到上一题的结果被当成这一题的；
/// 2. 响应按 `questionId` 取，取的是**本面板那一道题**，不是 Map 里任意一份；
/// 3. 关掉面板必须 `Navigator.pop` 掉整条路由（不是把内容换成空态留在屏上）。
void main() {
  group('三态渲染', () {
    testWidgets('生成中：显示进度与提示，不显示空态', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(isAnalyzing: true),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('正在深入解构逻辑本质...'), findsOneWidget);
      expect(find.text('暂无分析数据'), findsNothing);
    });

    testWidgets('既没在生成也没有响应：空态且没有转圈', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(),
      );

      expect(find.text('暂无分析数据'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('生成中优先于已有响应（不会把别的题的结果先亮出来）', (
      WidgetTester tester,
    ) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          isAnalyzing: true,
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(
              analysis: '上一轮的分析结果',
              cached: true,
            ),
          },
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('暂无分析数据'), findsNothing);
    });

    testWidgets('只看本道题的响应：别的题有分析，这题仍是空态', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-2'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(analysis: '第一题的分析', cached: false),
          },
        ),
      );

      expect(find.text('暂无分析数据'), findsOneWidget);
    });

    testWidgets('有本道题的响应时进入内容分支（当前模型缺字段 → 缺陷锁定）', (
      WidgetTester tester,
    ) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(analysis: '本质是三段论', cached: false),
          },
        ),
      );

      // 走到这里说明 `else if (response != null)` 分支被选中了（不是空态）。
      expect(find.text('暂无分析数据'), findsNothing);

      // 但该分支当前必崩：`FirstPrinciplesResponse` 只有 analysis/cached，
      // 面板读的是 coreEssence / fundamentalComponents /
      // reconstructedUnderstanding（形参是 dynamic，编译期不报错）→ NoSuchMethodError。
      // 这是 lib 里的缺陷，不在本批修。模型与面板对齐后，本用例必须改成断言
      // 三段正文（核心本质/基本要素/重构理解），**不能删**。
      expect(
        tester.takeException(),
        isA<NoSuchMethodError>(),
        reason: '面板访问了 FirstPrinciplesResponse 上不存在的字段',
      );
    });
  });

  group('关闭交互', () {
    testWidgets('点关闭 pop 掉整条面板路由，回到打开它的那一屏', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const _PanelLauncher(),
        overrides: fakeFirstPrinciples(),
      );

      await tester.tap(find.text('打开面板'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('AI 第一性原理透视'), findsOneWidget);

      await tester.tap(find.byTooltip('关闭'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('AI 第一性原理透视'), findsNothing);
      // 回到打开它的屏，而不是留在一条内容被清空的面板上。
      expect(find.text('打开面板'), findsOneWidget);
    });
  });

  // 缺一条「375 宽 + 1.3 倍字号不溢出」：实测头部 Row 溢出 6.9px（内层 Row 没有
  // Flexible/Expanded，图标 + 两行标题 + 关闭按钮挤在同一行）。修 lib 之前写这条
  // 用例只能红，故留空；`first_principles_panel.dart` 修好后按 pump_screen 的
  // `expectNoLayoutError` 补回。
}

/// 复刻 `practice_screen` 的打开方式（`isScrollControlled` + 透明底），
/// 这样「pop 的是面板这条路由」这件事测的是真实调用路径。
class _PanelLauncher extends StatelessWidget {
  const _PanelLauncher();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: TextButton(
          onPressed: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const FirstPrinciplesPanel(questionId: 'q-1'),
          ),
          child: const Text('打开面板'),
        ),
      ),
    );
  }
}
