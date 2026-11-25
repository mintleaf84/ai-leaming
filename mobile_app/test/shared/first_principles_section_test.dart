import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/practice/domain/first_principles_params.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/presentation/first_principles_provider.dart';
import 'package:mobile_app/shared/widgets/ai_analysis_card.dart';
import 'package:mobile_app/shared/widgets/first_principles_section.dart';

import '../support/fake_providers.dart';
import '../support/pump_screen.dart';

/// 第一性原理区域（历史详情里的「✨ 查看第一性原理分析」）守的是四件事：
///
/// 1. **默认折叠且不请求**：AI 分析是一次真实的模型调用，展开前就发出去的话，
///    一屏十条日志会把十条都送去分析（费用与首屏时间都翻倍）；
/// 2. **参数取自这一条日志**，而且**答对时不带错误答案**——把对的作答当错解
///    喂给模型，会得到一段解释「为什么这个错解不对」的废话；
/// 3. **失败只给统一文案 + 重试**，且重试真的重新发请求（不是把错误重画一遍）；
/// 4. **收起是把入口换回来**，不是把卡片清空留一块空白。
void main() {
  Widget host(Widget child) =>
      Scaffold(body: SingleChildScrollView(child: child));

  group('折叠态', () {
    testWidgets('默认只显示入口，一次分析都不发', (WidgetTester tester) async {
      final seen = <FirstPrinciplesParams>[];
      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: fakeLog())),
        overrides: fakeAnalysis(seen),
      );

      expect(find.text('查看第一性原理分析'), findsOneWidget);
      expect(
        find.byType(AiAnalysisCard),
        findsNothing,
        reason: '没点开的日志不该占一张卡片的高度',
      );
      expect(seen, isEmpty, reason: '展开前不发模型请求');
    });
  });

  group('展开后', () {
    testWidgets('请求参数就是这一条日志，答对时不带 wrongAnswer', (
      WidgetTester tester,
    ) async {
      final log = fakeLog(content: '教育目的是什么？', correctAnswer: 'B');
      final seen = <FirstPrinciplesParams>[];
      final gate = Completer<FirstPrinciplesResponse>();

      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: log)),
        overrides: fakeAnalysis(seen, gate: gate),
      );
      await tester.tap(find.text('查看第一性原理分析'));
      await tester.pump();
      await tester.pump();

      expect(
        seen.single,
        const FirstPrinciplesParams(
          questionContent: '教育目的是什么？',
          correctAnswer: 'B',
          explanation: '这是解析正文',
        ),
        reason: '答对的题没有「错误答案」可给，硬塞会把对的作答当错解分析',
      );

      expect(
        find.byWidgetPredicate((Widget w) => w is Skeletonizer),
        findsOneWidget,
        reason: '请求还在路上：要看到骨架，而不是一片空白',
      );
      expect(find.byType(MarkdownBody), findsNothing);
    });

    testWidgets('答错的题把 userAnswer 作为 wrongAnswer 带上', (
      WidgetTester tester,
    ) async {
      final seen = <FirstPrinciplesParams>[];
      final log = fakeLog(isCorrect: false, userAnswer: 'C', correctAnswer: 'A');

      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: log)),
        overrides: fakeAnalysis(seen),
      );
      await tester.tap(find.text('查看第一性原理分析'));
      await tester.pump();
      await tester.pump();

      expect(seen.single.wrongAnswer, 'C');
    });

    testWidgets('拿到结果：Markdown 正文渲染出来', (WidgetTester tester) async {
      final seen = <FirstPrinciplesParams>[];
      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: fakeLog())),
        overrides: fakeAnalysis(
          seen,
          response: const FirstPrinciplesResponse(
            analysis: '**核心逻辑**：教育目的是教育工作的出发点和归宿。',
            cached: false,
          ),
        ),
      );

      await tester.tap(find.text('查看第一性原理分析'));
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(find.byType(MarkdownBody), findsOneWidget);
      expect(
        find.textContaining('教育目的是教育工作的出发点和归宿'),
        findsOneWidget,
      );
      expect(find.text('分析失败'), findsNothing);
    });

    testWidgets('失败：统一文案 + 重试，点重试重新发请求', (WidgetTester tester) async {
      final seen = <FirstPrinciplesParams>[];
      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: fakeLog())),
        overrides: fakeAnalysis(seen, error: StateError('模型返回为空')),
      );

      await tester.tap(find.text('查看第一性原理分析'));
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(find.textContaining('出了点问题，请重试'), findsOneWidget);
      expect(
        find.textContaining('模型返回为空'),
        findsNothing,
        reason: '异常原文只进日志（审计 #24），界面只给统一文案',
      );
      expect(find.byType(MarkdownBody), findsNothing);

      await tester.tap(find.text('点击重试'));
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(
        seen.length,
        2,
        reason: '「重试」必须真的重新发一次请求，而不是把错误文案再画一遍',
      );
    });

    testWidgets('收起：换回入口，不留空卡片', (WidgetTester tester) async {
      final seen = <FirstPrinciplesParams>[];
      await pumpScreen(
        tester,
        host(FirstPrinciplesSection(log: fakeLog())),
        overrides: fakeAnalysis(
          seen,
          response: const FirstPrinciplesResponse(analysis: '分析正文', cached: false),
        ),
      );

      await tester.tap(find.text('查看第一性原理分析'));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(find.byType(AiAnalysisCard), findsOneWidget);

      await tester.tap(find.byIcon(AppIcons.keyboardArrowUp));
      await tester.pump();

      expect(find.byType(AiAnalysisCard), findsNothing);
      expect(find.text('查看第一性原理分析'), findsOneWidget);
    });
  });
}

/// 把整个 family 换成测试实现：`seen` 记下**实际传进来的参数**，
/// 这是本组件唯一会「悄悄错位」的地方（拿错日志、答对也带 wrongAnswer）。
///
/// [gate] 挂住结果用来观察加载态；[error] 用来观察失败态。
List<Object> fakeAnalysis(
  List<FirstPrinciplesParams> seen, {
  FirstPrinciplesResponse? response,
  Object? error,
  Completer<FirstPrinciplesResponse>? gate,
}) {
  return <Object>[
    firstPrinciplesProvider.overrideWith((ref, arg) async {
      seen.add(arg);
      final pending = gate;
      if (pending != null) return pending.future;
      final failure = error;
      if (failure != null) throw failure;
      return response ??
          const FirstPrinciplesResponse(analysis: '分析正文', cached: false);
    }),
  ];
}
