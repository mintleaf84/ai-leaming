import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';

import '../../support/fake_providers.dart';
import '../../support/fakes_agent_sets.dart';
import '../../support/pump_router_misc.dart';

/// 路由接线的冒烟用例（走生产 `buildAppRouter`）。
///
/// 屏级用例用的是临时路由表，路径写成 `/agent-sets/:id` 之外的样子照样绿；
/// 这里钉的是「首页卡片点进去真的落在练习屏」，而不是一个空白页。
void main() {
  setUpAll(useFakeSecureStorage);

  AgentSetsStubAdapter adapter() {
    return AgentSetsStubAdapter((options) {
      final path = options.path;
      if (path == '/agent-sets/12') {
        return agentSetsJson(
          agentSetDetailJson(
            set: agentSetJson(id: 12, title: '路由冒烟题集'),
            questions: <Map<String, dynamic>>[
              agentQuestionJson(id: 11, content: '路由冒烟题'),
            ],
          ),
        );
      }
      if (path.endsWith('/attempts')) {
        return agentSetsJson(
          agentSetAttemptJson(
            questions: <Map<String, dynamic>>[
              agentQuestionJson(id: 11, content: '路由冒烟题'),
            ],
          ),
        );
      }
      return agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[agentSetJson(id: 12, title: '路由冒烟题集')],
        ),
      );
    });
  }

  Future<void> pumpAt(WidgetTester tester, String location) async {
    await pumpRouter(
      tester,
      initialLocation: location,
      overrides: <Object>[
        ...fakeAgentSets(adapter()),
        practiceRepositoryProvider.overrideWithValue(FakePracticeRepository()),
      ],
    );
    await settleRouter(tester);
  }

  testWidgets('AppRoutes.agentSets 落在题集列表', (tester) async {
    await pumpAt(tester, AppRoutes.agentSets);

    expect(find.text('AI 题集'), findsOneWidget);
    expect(find.text('路由冒烟题集'), findsOneWidget);
  });

  testWidgets('AppRoutes.agentSet(id) 落在练习屏并带上 id', (tester) async {
    await pumpAt(tester, AppRoutes.agentSet(12));

    expect(find.text('路由冒烟题集'), findsOneWidget);
    expect(find.text('路由冒烟题'), findsOneWidget);
    expect(find.text('第 1/1 题'), findsOneWidget);
  });
}
