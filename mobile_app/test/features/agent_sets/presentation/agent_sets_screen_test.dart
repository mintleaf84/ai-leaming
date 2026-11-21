import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_sets_screen.dart';
import 'package:mobile_app/features/agent_sets/presentation/widgets/agent_set_unread_badge.dart';

import '../../../support/fakes_agent_sets.dart';
import '../../../support/pump_router.dart';

/// 题集列表屏：空态、数据态、未读角标、点卡进详情、失败可重试。
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 8; index++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  Future<GoRouter> pumpList(
    WidgetTester tester,
    AgentSetsStubAdapter adapter,
  ) async {
    final router = await pumpRouter(
      tester,
      initialLocation: '/agent-sets',
      routes: <String, WidgetBuilder>{
        '/agent-sets': (_) => const AgentSetsScreen(),
        '/agent-sets/:id': (_) => const Scaffold(body: Text('练习页')),
      },
      overrides: <Object>[...fakeAgentSets(adapter)],
    );
    await settle(tester);
    return router;
  }

  testWidgets('空列表：说明「外部 Agent 推来的题会出现在这里」，不是错误态', (tester) async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(<String, dynamic>{
        'data': <Map<String, dynamic>>[],
        'meta': <String, dynamic>{'limit': 50, 'offset': 0, 'total': 0},
      }),
    );

    await pumpList(tester, adapter);

    expect(find.text('还没有 AI 题集'), findsOneWidget);
    expect(find.textContaining('外部 Agent 推来的题会出现在这里'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
    expect(find.text('共 0 套'), findsNothing);
  });

  testWidgets('有题集：来源 / 考点 / 剩余 / 上次成绩都来自服务端', (tester) async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[
            agentSetJson(
              id: 1,
              title: '教育目的专项',
              agent: 'claude-code',
              model: 'sonnet',
              targetTags: <String>['教育学', '教育目的', '德育', '班级管理'],
              questionCount: 10,
              pendingCount: 4,
              unreadCount: 3,
              lastScore: 0.85,
            ),
            agentSetJson(
              id: 2,
              title: '心理学基础',
              agent: null,
              targetTags: const <String>['心理学'],
              pendingCount: 0,
              questionCount: 5,
            ),
          ],
        ),
      ),
    );

    await pumpList(tester, adapter);

    expect(find.text('教育目的专项'), findsOneWidget);
    expect(find.text('claude-code · sonnet'), findsOneWidget);
    // 考点最多 3 个，多出来的收成 +N
    expect(find.text('教育学'), findsOneWidget);
    expect(find.text('+1'), findsOneWidget);
    expect(find.text('剩 4 题'), findsOneWidget);
    expect(find.text('上次 85%'), findsOneWidget);
    // 来源缺失时给「未标注来源」，不留空白
    expect(find.text('未标注来源'), findsOneWidget);
    expect(find.text('已做完'), findsOneWidget);
    expect(find.text('共 2 套'), findsOneWidget);
    expect(find.text('3 道没看过'), findsOneWidget);
  });

  testWidgets('未读角标：只在有未读的卡上出现，数值等于服务端 unreadCount', (tester) async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[
            agentSetJson(id: 1, unreadCount: 3),
            agentSetJson(id: 2, title: '都看过了', unreadCount: 0),
          ],
        ),
      ),
    );

    await pumpList(tester, adapter);

    final badges = tester.widgetList<AgentSetUnreadBadge>(
      find.byType(AgentSetUnreadBadge),
    );
    expect(badges, hasLength(1));
    expect(badges.single.count, 3);
  });

  testWidgets('点卡片：进这套题的练习屏', (tester) async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetPageJson(sets: <Map<String, dynamic>>[agentSetJson(id: 12)]),
      ),
    );
    final router = await pumpList(tester, adapter);

    await tester.tap(find.text('教综 · 教育目的专项'));
    await settle(tester);

    // 断言「练习页真的在台上」而不是当前 uri：go_router 的
    // `currentConfiguration.uri` 只反映 declarative（go）落点，`push` 出来的
    // 页面记在 matches 里、uri 仍停在列表页（exam 列表用例同一口径）。
    expect(find.text('练习页'), findsOneWidget);
    expect(router.canPop(), isTrue);
    expect(
      router.routerDelegate.currentConfiguration.matches.map(
        (match) => match.matchedLocation,
      ),
      contains('/agent-sets/12'),
    );
  });

  testWidgets('首屏失败：显示可重试的错误，点重试重新拉一次', (tester) async {
    var failNext = true;
    final adapter = AgentSetsStubAdapter((options) {
      if (failNext) {
        failNext = false;
        return agentSetsJson(<String, dynamic>{
          'message': '服务端炸了',
        }, statusCode: 500);
      }
      return agentSetsJson(
        agentSetPageJson(sets: <Map<String, dynamic>>[agentSetJson()]),
      );
    });

    await pumpList(tester, adapter);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.textContaining('500'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('教综 · 教育目的专项'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
    expect(adapter.gets, hasLength(2));
  });
}
