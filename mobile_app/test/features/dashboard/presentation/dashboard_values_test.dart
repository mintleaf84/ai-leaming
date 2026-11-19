import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/history/domain/history_item.dart';
import 'package:mobile_app/features/recall/data/recall_providers.dart';
import 'package:mobile_app/features/recall/domain/recall_queue.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 首页三张功能卡的数值（审计 §25 F1/F4/F5）。
///
/// 守的线：**卡面上的数字必须来自数据，取不到就说「暂无」**。
/// 改前这里写死「累计 --」「每次 几分钟」「最近 回顾」，用户会以为数据没加载；
/// 所以用例不只断言「有数据时显示对」，还断言「占位符彻底消失」——
/// 否则以后有人再塞一个 `'--'` 进去，前一类用例照样绿。
void main() {
  /// 三张卡共用的文案：这些字符串在卡面上**不该再出现**。
  const placeholders = <String>['--', '几分钟', '回顾'];

  void expectNoPlaceholders() {
    for (final text in placeholders) {
      expect(find.text(text), findsNothing, reason: '「$text」是写死的占位符');
    }
  }

  testWidgets('有数据：到期张数 / 累计错题 / 最近练习时间都是真实值', (tester) async {
    final now = DateTime.now();
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(
          stats: fakeLearningStats(todayCount: 12, todayCorrect: 9),
        ),
        ...fakeContractPending(),
        ...fakeRecallQueue(due: 3, fresh: 2),
        ...fakeWrongBook(stats: const WrongBookStats(total: 24)),
        ...fakeHistory(
          items: <HistoryItem>[fakeHistoryItem(createdAt: now.toIso8601String())],
        ),
      ],
    );
    await tester.pump();

    expect(find.text('3 张'), findsOneWidget, reason: '记忆卡应显示今日到期张数');
    expect(find.text('24 条'), findsOneWidget, reason: '错题卡应显示累计条数');
    expect(
      find.textContaining('今天 '),
      findsOneWidget,
      reason: '历史卡应显示最近一次练习时间（今天 HH:MM）',
    );
    expectNoPlaceholders();
  });

  testWidgets('无数据：到期 0 显示「今天已完成」，错题/历史显示「暂无」', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(stats: const WrongBookStats()),
        ...fakeHistory(),
      ],
    );
    await tester.pump();

    expect(
      find.text('今天已完成'),
      findsOneWidget,
      reason: '到期 0 张时不该显示「0 张」（读起来像还没开始）',
    );
    // 错题 + 历史两处都是「暂无」
    expect(find.text('暂无'), findsNWidgets(2));
    expectNoPlaceholders();
  });

  testWidgets('队列取不到：显示「暂无」而不是编一个数字', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(),
        ...fakeContractPending(),
        recallQueueProvider.overrideWith(
          (ref) => Future<RecallQueue>.error(Exception('offline')),
        ),
        ...fakeWrongBook(loadError: Exception('offline')),
        ...fakeHistory(error: 'offline'),
      ],
    );
    await tester.pump();

    // 记忆卡 + 错题 + 历史：三处都取不到 → 三处「暂无」
    expect(find.text('暂无'), findsNWidgets(3));
    expectNoPlaceholders();
  });

  testWidgets('有未完成练习：首页出「继续上次练习」并显示进度', (tester) async {
    final resume = jsonEncode(<String, dynamic>{
      'sessionId': 'session_9',
      'answered': 2,
      'total': 8,
      'mode': 'random',
      'savedAt': DateTime.now().toIso8601String(),
    });

    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
        ...fakePreferences(
          initial: <String, String>{PreferencesKeys.practiceResume: resume},
        ),
      ],
    );
    // 断点是异步读盘的：多推一帧让它落地
    await tester.pump();

    expect(find.text('继续上次练习'), findsOneWidget);
    expect(
      find.text('3/8 题'),
      findsOneWidget,
      reason: '已答 2 题 → 下一题是第 3 题',
    );
  });

  testWidgets('没有断点（或已作废）：首页不出现「继续上次练习」', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: <Object>[
        ...fakeStats(),
        ...fakeContractPending(),
        ...fakeRecallQueue(),
        ...fakeWrongBook(),
        ...fakeHistory(),
        // 空串是「已清除」的写法（见 PracticeResumeController.clear）
        ...fakePreferences(
          initial: <String, String>{PreferencesKeys.practiceResume: ''},
        ),
      ],
    );
    await tester.pump();

    expect(find.text('继续上次练习'), findsNothing);
  });
}
