import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/presentation/widgets/first_principles_panel.dart';

import '../../../support/fakes_first_principles.dart';
import '../../../support/pump_screen.dart';

/// 这个面板守的是**分支顺序**、**取哪一份数据**与**真实契约的渲染**：
///
/// 1. `isAnalyzing` 优先于「已有响应/失败/空态」——生成中就只能是加载态，
///    否则用户会看到上一题的结果被当成这一题的；
/// 2. 响应按 `questionId` 取，取的是**本面板那一道题**，不是 Map 里任意一份；
/// 3. 服务端契约是 `{analysis, cached}`，`analysis` 是 `【小标题】正文` 的纯文本，
///    面板必须把它渲染出来，而不是去读不存在的结构化字段（那会 NoSuchMethodError）；
/// 4. 失败要给可读原因 + 「重试」，重试真的重发请求；
/// 5. 关掉面板必须 `Navigator.pop` 掉整条路由（不是把内容换成空态留在屏上）。
void main() {
  /// 服务端真实格式：`【答案】X` 之后接 `【核心逻辑】` 与正文。
  const serverAnalysis = '''
【答案】B
【核心逻辑】
教育目的是教育工作的出发点和归宿，决定了教育内容与方式。
【易错点】
把「教育目的」与「培养目标」混为一谈。
''';

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
      expect(find.textContaining('上一轮的分析结果'), findsNothing);
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
      expect(find.textContaining('第一题的分析'), findsNothing);
    });
  });

  group('渲染真实契约（{analysis, cached}）', () {
    testWidgets('渲染 analysis 正文：小标题与段落都出现在屏幕上，且不抛异常', (
      WidgetTester tester,
    ) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(
              analysis: serverAnalysis,
              cached: false,
            ),
          },
        ),
      );

      expect(
        tester.takeException(),
        isNull,
        reason: '面板只能读 FirstPrinciplesResponse 上真实存在的字段',
      );

      // `【答案】` 与它的同一行正文：小标题 + 正文都要在。
      expect(find.text('【答案】'), findsOneWidget);
      expect(find.text('B'), findsOneWidget);
      expect(find.text('【核心逻辑】'), findsOneWidget);
      expect(
        find.textContaining('教育目的是教育工作的出发点和归宿'),
        findsOneWidget,
        reason: 'analysis 正文必须真的渲染出来，否则用户点了 AI 分析什么也看不到',
      );
      expect(find.text('【易错点】'), findsOneWidget);
      expect(find.textContaining('把「教育目的」与「培养目标」混为一谈'), findsOneWidget);
      expect(find.text('暂无分析数据'), findsNothing);
    });

    testWidgets('cached=true：给出「已缓存」标签', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(
              analysis: '【答案】B',
              cached: true,
            ),
          },
        ),
      );

      expect(find.text('已缓存'), findsOneWidget);
    });

    testWidgets('cached=false 不显示「已缓存」标签', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(analysis: '【答案】B', cached: false),
          },
        ),
      );

      expect(find.text('已缓存'), findsNothing);
    });

    testWidgets('没有小标题的纯文本也要渲染（不吞内容）', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(
              analysis: '模型这次没按格式输出，\n但正文必须原样显示。',
              cached: false,
            ),
          },
        ),
      );

      expect(find.textContaining('模型这次没按格式输出'), findsOneWidget);
      expect(find.textContaining('但正文必须原样显示'), findsOneWidget);
    });

    testWidgets('analysis 是空串：落回空态而不是一片空白', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(analysis: '   ', cached: false),
          },
        ),
      );

      expect(find.text('暂无分析数据'), findsOneWidget);
    });
  });

  group('失败态', () {
    testWidgets('显示可读原因与「重试」，点重试真的重发请求', (WidgetTester tester) async {
      // 直接持有 fake：`fetchCalls` 记的是「被要求重新分析的题号」，
      // 断言它才知道重试真的又发了一次请求（而不是只换了个文案）。
      final controller = FakePracticeController(
        const PracticeSessionState(
          firstPrinciplesError: '获取 AI 分析失败：网络连接超时',
        ),
      );

      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: <Object>[
          practiceControllerProvider.overrideWith(() => controller),
        ],
      );

      expect(find.textContaining('网络连接超时'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
      expect(find.text('暂无分析数据'), findsNothing);
      expect(controller.fetchCalls, isEmpty);

      await tester.tap(find.text('重试'));
      await tester.pump();

      expect(controller.fetchCalls, <String>['q-1']);
    });

    testWidgets('整场练习的粗粒度 error 不冒充本面板的失败态', (WidgetTester tester) async {
      // `state.error` 是「创建会话失败」这类整场错误。面板拿它判断的话，
      // 打开一道没分析过的题会看到一条与 AI 分析无关的红字。
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        overrides: fakeFirstPrinciples(error: '请先登录'),
      );

      expect(find.textContaining('请先登录'), findsNothing);
      expect(find.text('暂无分析数据'), findsOneWidget);
      expect(find.text('重试'), findsNothing);
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

  group('版式', () {
    testWidgets('375×667 + 1.3 倍字号：头部不溢出、正文可滚动', (WidgetTester tester) async {
      await pumpScreen(
        tester,
        const FirstPrinciplesPanel(questionId: 'q-1'),
        textScale: 1.3,
        overrides: fakeFirstPrinciples(
          responses: <String, FirstPrinciplesResponse>{
            'q-1': const FirstPrinciplesResponse(
              analysis: serverAnalysis,
              cached: true,
            ),
          },
        ),
      );

      expectNoLayoutError(
        tester,
        reason: '图标 + 两行标题 + 关闭按钮必须能在这个宽度下收进一行',
      );
    });
  });
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
