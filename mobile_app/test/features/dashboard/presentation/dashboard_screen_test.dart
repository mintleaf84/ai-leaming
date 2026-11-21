import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/stats/presentation/stats_provider.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 首页冒烟。
///
/// 首页守的是一条很容易被「优化」掉的线：**没有数据时不许编数字**。
/// 断网时 `LearningStats.empty` 会一路渲染成「今日目标：尚未开始 / 0%」，
/// 这和「今天真的没学」长得一样——所以审计之后统计区补了 loading/error 两态。
/// 这里用「进度条的 value」而不是文案来钉：value 是数据驱动的，改文案不会误伤，
/// 而一旦有人把假数字写死进界面，value 立刻对不上。
void main() {
  testWidgets('有待办：进度条按 todayCount 计算，三条待办各就各位', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(
          stats: fakeLearningStats(
            todayCount: 12,
            todayCorrect: 9,
            streakDays: 5,
          ),
        ),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
      ],
    );
    await tester.pump();

    final progress = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    // 每日目标固定 20 题：12/20
    expect(progress.value, closeTo(0.6, 0.001));

    // 三条待办：练习（未完成）/ 复盘错题（未完成）/ 连续学习（已完成）
    expect(find.byIcon(AppIcons.playCircleOutline), findsOneWidget);
    expect(find.byIcon(AppIcons.errorOutline), findsOneWidget);
    expect(find.byIcon(AppIcons.checkCircle), findsOneWidget);
  });

  testWidgets('无待办：进度归零，不出现「已练 N 题」这种编出来的数字', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
      ],
    );
    await tester.pump();

    final progress = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(progress.value, 0);
    // 「已练 X 题」只在今天真的有作答时出现
    expect(find.textContaining('已练'), findsNothing);
  });

  testWidgets('统计失败：就地显示可重试的错误条，点重试会重新加载', (tester) async {
    final controller = FakeStatsController(const StatsState(error: 'offline'));

    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(controller: controller),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
      ],
    );
    await tester.pump();

    // 失败时统计区整块换成错误条，进度条不再渲染（避免看起来像"今天没学"）
    expect(find.byType(LinearProgressIndicator), findsNothing);
    final retry = find.text('重试');
    expect(retry, findsOneWidget);

    // 首页内容比一屏长，错误条可能落在折叠线以下：先滚到可见再点，
    // 否则 tap 会打在屏幕外（用例会假绿：加载次数早就在挂载时 +1 了）。
    await tester.ensureVisible(retry);
    await tester.pump();
    // 挂载时已经加载过一次：先记下来，点完只认「又多了一次」，
    // 否则这条断言在「点了没反应」时也会绿（review C9）。
    final before = controller.loadCalls;
    await tester.tap(retry);
    await tester.pump();
    expect(
      controller.loadCalls,
      before + 1,
      reason: '点重试必须真的再加载一次',
    );
  });

  testWidgets('加载中且无数据：出骨架，不把空数据当结论', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(isLoading: true),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
      ],
    );
    await tester.pump();

    // 骨架用假数据撑真实版式（Skeletonizer 涂抹），所以这里能看到进度条是
    // 正常的；关键是它被骨架层包住、且没有落到「错误」或「空结论」上。
    expect(
      find.byWidgetPredicate((widget) => widget is Skeletonizer),
      findsOneWidget,
    );
    expect(find.text('重试'), findsNothing);
  });
}
