import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/history/domain/practice_log.dart';
import 'package:mobile_app/features/history/presentation/history_detail_screen.dart';
import 'package:mobile_app/features/history/presentation/history_provider.dart';
import 'package:mobile_app/features/settings/presentation/settings_provider.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 练习详情屏冒烟。
///
/// 这里守的是**三种数据形态各自的出口**：
/// - 有 logs：摘要 + 每题一个可展开卡片（展开是这屏唯一的交互）；
/// - 空 logs：摘要还在，但列表位置必须是空态，不能什么都不显示；
/// - 失败：有重试入口，且重试真的会重新请求（不是画个按钮了事）。
///
/// 数据走 `historyDetailProvider` 的 family 单元素 override——这屏的全部数据
/// 都从这一个 provider 来，override 它就等于把服务端换成了测试数据。
void main() {
  const sessionId = 'session_1';

  HistoryDetailState stateWith(List<PracticeLog> logs) {
    return HistoryDetailState(
      session: fakeHistoryItem(accuracy: 70, totalQuestions: logs.length),
      logs: logs,
    );
  }

  testWidgets('有 logs：摘要 + 每题一张可展开卡片', (tester) async {
    final logs = <PracticeLog>[
      fakeLog(questionId: 1, content: '第一题题干'),
      fakeLog(
        questionId: 2,
        content: '第二题题干',
        isCorrect: false,
        userAnswer: 'B',
      ),
    ];

    await pumpScreen(
      tester,
      const HistoryDetailScreen(sessionId: sessionId),
      overrides: fakeHistoryDetail(sessionId, state: stateWith(logs)),
    );

    // 摘要区：正确率与题量都来自 session 数据
    expect(find.textContaining('70%'), findsOneWidget);
    expect(find.textContaining('${logs.length}'), findsWidgets);

    final tiles = find.byType(ExpansionTile);
    expect(tiles, findsNWidgets(logs.length));
    expect(find.text('第一题题干'), findsOneWidget);
    expect(find.text('第二题题干'), findsOneWidget);

    // 展开第一题：选项与解析区应当出现（默认是收起的）
    expect(find.textContaining('这是解析正文'), findsNothing);
    await tester.tap(tiles.first);
    await tester.pumpAndSettle();
    expect(find.textContaining('这是解析正文'), findsOneWidget);
  });

  testWidgets('空 logs：摘要保留，列表位置走空态', (tester) async {
    await pumpScreen(
      tester,
      const HistoryDetailScreen(sessionId: sessionId),
      overrides: fakeHistoryDetail(
        sessionId,
        state: stateWith(<PracticeLog>[]),
      ),
    );

    expect(find.textContaining('70%'), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNothing);
  });

  testWidgets('失败：给出重试入口，点了会重新请求', (tester) async {
    await pumpScreen(
      tester,
      const HistoryDetailScreen(sessionId: sessionId),
      overrides: fakeHistoryDetail(
        sessionId,
        state: stateWith(<PracticeLog>[fakeLog()]),
        error: StateError('boom'),
        errorOnce: true,
      ),
    );
    await tester.pump();

    expect(find.byIcon(AppIcons.errorOutline), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNothing);

    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();

    // 重试后拿到数据：说明 invalidate 真的重跑了 provider
    expect(find.byType(ExpansionTile), findsOneWidget);
    expect(find.byIcon(AppIcons.errorOutline), findsNothing);
  });

  testWidgets('沉浸模式：整屏换成翻页，摘要作为第 0 页', (tester) async {
    await pumpScreen(
      tester,
      const HistoryDetailScreen(sessionId: sessionId),
      overrides: <Object>[
        ...fakeHistoryDetail(
          sessionId,
          state: stateWith(<PracticeLog>[fakeLog()]),
        ),
        ...fakeReviewMode(ReviewMode.immersive),
      ],
    );

    expect(find.byType(PageView), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNothing);
    expect(find.textContaining('70%'), findsOneWidget);
  });
}
