import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/network/connectivity_provider.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_set_inbox.dart';
import 'package:mobile_app/features/history/domain/history_item.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_inbox_provider.dart';
import 'package:mobile_app/features/agent_sets/presentation/widgets/agent_set_unread_badge.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 首页「AI 题集」入口：能力协商 + 未读角标 + 离线禁用。
///
/// 服务端由另一条 lane 并行上线，旧服务端的 `/meta` 里没有 `agent_sets`；
/// 这时入口必须整张消失，而不是让用户点进一个必然 404 的页面。
class _StubInboxController extends AgentSetInboxController {
  _StubInboxController(this.initial);

  final AgentSetInboxState initial;

  @override
  AgentSetInboxState build() => initial;
}

void main() {
  setUpAll(useFakeSecureStorage);

  List<Object> overridesWith({
    required Set<String> features,
    AgentSetInboxState? inbox,
    bool online = true,
    bool withHistory = false,
  }) {
    return <Object>[
      ...fakeStats(),
      contractDecisionProvider.overrideWith(
        (ref) async => ContractDecision(
          status: ContractCompat.ok,
          meta: ContractMeta(contractVersion: 1, features: features),
        ),
      ),
      ...fakeRecallQueue(),
      ...fakeWrongBook(),
      // 默认「练习历史」为空也会显示「暂无」，会与 AI 卡的同款文案撞车；
      // 需要精确断言的用例给一条历史，让「暂无」只剩一个来源。
      ...(withHistory
          ? fakeHistory(items: <HistoryItem>[fakeHistoryItem()])
          : fakeHistory()),
      ...fakePreferences(),
      isOnlineProvider.overrideWith((ref) => Stream<bool>.value(online)),
      agentSetInboxProvider.overrideWith(
        () => _StubInboxController(
          inbox ??
              const AgentSetInboxState(
                inbox: AgentSetInbox(
                  unreadCount: 3,
                  pendingCount: 5,
                  setCount: 1,
                  latestSetId: 1,
                  latestTitle: '教育目的专项',
                ),
              ),
        ),
      ),
    ];
  }

  testWidgets('服务端具备 agent_sets：入口出现，右侧报未读数、标题旁带角标', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(
        features: <String>{'recall', 'exam', 'agent_sets'},
      ),
    );
    await tester.pump();

    expect(find.text('AI 题集'), findsOneWidget);
    expect(find.text('Agent 推题'), findsOneWidget);
    expect(find.text('3 道未读'), findsOneWidget);

    final badges = tester.widgetList<AgentSetUnreadBadge>(
      find.byType(AgentSetUnreadBadge),
    );
    expect(badges, hasLength(1));
    expect(badges.single.count, 3);
  });

  testWidgets('服务端没有 agent_sets：入口整张消失（不灰显、不占位）', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(features: <String>{'recall'}),
    );
    await tester.pump();

    expect(find.text('AI 题集'), findsNothing);
    expect(find.text('Agent 推题'), findsNothing);
  });

  testWidgets('还没拉过未读：给「暂无」，不写 0 道未读、也不显示角标', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(
        features: <String>{'agent_sets'},
        inbox: const AgentSetInboxState(),
        withHistory: true,
      ),
    );
    await tester.pump();

    expect(find.text('AI 题集'), findsOneWidget);
    expect(find.text('暂无'), findsOneWidget);
    expect(find.byType(AgentSetUnreadBadge), findsNothing);
  });

  testWidgets('离线：入口保留但禁用，写清原因', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(features: <String>{'agent_sets'}, online: false),
    );
    await tester.pump();

    expect(find.text('AI 题集'), findsOneWidget);
    expect(find.text('需要联网'), findsOneWidget);
    expect(find.text('离线，联网后可查看 AI 题集'), findsOneWidget);
  });
}
