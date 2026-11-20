import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/shared/widgets/empty_state.dart';

import '../../support/pump_screen.dart';

/// 通用空状态冒烟。
///
/// 三件事：图标/标题/副标题都渲染；给了 actionLabel + onAction 才有按钮且能点；
/// 只给 actionLabel 不给回调时**不能**渲染一个点不动的按钮。
void main() {
  Widget host(Widget child) => Scaffold(body: child);

  testWidgets('图标、标题、副标题都渲染', (tester) async {
    await pumpScreen(
      tester,
      host(
        const EmptyState(
          icon: '📚',
          title: '还没有教材',
          subtitle: '联系管理员上传后就能在这里看到',
        ),
      ),
    );
    await tester.pumpAndSettle(); // 入场动画（600ms）

    expect(find.text('📚'), findsOneWidget);
    expect(find.text('还没有教材'), findsOneWidget);
    expect(find.text('联系管理员上传后就能在这里看到'), findsOneWidget);
    expect(find.byType(ElevatedButton), findsNothing);
  });

  testWidgets('行动按钮：渲染且点击触发回调', (tester) async {
    var actions = 0;
    await pumpScreen(
      tester,
      host(
        EmptyState(
          icon: '🎯',
          title: '今天还没开始',
          subtitle: '做一组练习吧',
          actionLabel: '开始练习',
          onAction: () => actions++,
        ),
      ),
    );
    await tester.pumpAndSettle();

    // EmptyState 现在是 AppEmptyView 的薄壳，动作按钮是 TextButton
    final button = find.byType(TextButton);
    expect(button, findsOneWidget);

    await tester.tap(button);
    expect(actions, 1);
  });

  testWidgets('只有 actionLabel 没有回调：不渲染按钮', (tester) async {
    await pumpScreen(
      tester,
      host(
        const EmptyState(
          icon: '🗂',
          title: '空',
          subtitle: '没有内容',
          actionLabel: '去创建',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(ElevatedButton), findsNothing);
  });
}
