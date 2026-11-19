import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/shared/widgets/animated_option_card.dart';
import 'package:mobile_app/core/theme/app_icons.dart';

import '../../support/pump_screen.dart';

/// 选项卡片冒烟。
///
/// 这个组件把「选中 / 答对 / 答错 / 只是提示正确答案 / 不可点」五种外观压在一个
/// `if` 链里，而且外面套了 `Transform.scale` 做点击缩放。测试要钉的是：
/// 状态一换，**前导图标**跟着换；`onTap` 为 null 时（判卷后）卡片真的不可点。
void main() {
  Widget host(Widget child) => Scaffold(body: Center(child: child));

  AnimatedOptionCard card({
    bool isSelected = false,
    bool isCorrect = false,
    bool isWrong = false,
    bool isMultiSelect = false,
    bool showCorrectHint = false,
    VoidCallback? onTap,
  }) {
    return AnimatedOptionCard(
      label: 'A',
      text: '选项甲',
      isSelected: isSelected,
      isCorrect: isCorrect,
      isWrong: isWrong,
      isMultiSelect: isMultiSelect,
      showCorrectHint: showCorrectHint,
      onTap: onTap,
    );
  }

  GestureDetector gesture(WidgetTester tester) {
    return tester.widget<GestureDetector>(
      find
          .descendant(
            of: find.byType(AnimatedOptionCard),
            matching: find.byType(GestureDetector),
          )
          .first,
    );
  }

  testWidgets('未选中：渲染「A. 选项甲」，前导是空圈（没有勾/点图标）', (tester) async {
    await pumpScreen(tester, host(card()));

    expect(find.text('A. 选项甲'), findsOneWidget);
    expect(find.byIcon(AppIcons.dot), findsNothing);
    expect(find.byIcon(AppIcons.check), findsNothing);
    expect(find.byIcon(AppIcons.close), findsNothing);
  });

  testWidgets('单选选中：前导变成实心点；多选选中：变成勾且是方框', (tester) async {
    await pumpScreen(tester, host(card(isSelected: true)));
    expect(find.byIcon(AppIcons.dot), findsOneWidget);
    expect(find.byIcon(AppIcons.check), findsNothing);

    await pumpScreen(tester, host(card(isSelected: true, isMultiSelect: true)));
    expect(find.byIcon(AppIcons.check), findsOneWidget);
    expect(find.byIcon(AppIcons.dot), findsNothing);
  });

  testWidgets('答对 / 答错：分别给勾与叉（颜色走语义色层）', (tester) async {
    await pumpScreen(tester, host(card(isSelected: true, isCorrect: true)));
    expect(find.byIcon(AppIcons.check), findsOneWidget);

    await pumpScreen(tester, host(card(isSelected: true, isWrong: true)));
    expect(find.byIcon(AppIcons.close), findsOneWidget);
  });

  testWidgets('不可点：onTap 为 null 时卡片不接手势', (tester) async {
    await pumpScreen(tester, host(card()));

    expect(gesture(tester).onTap, isNull);

    // 点一下也不能有副作用（不能抛异常）
    await tester.tapAt(tester.getCenter(find.byType(AnimatedOptionCard)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('可点：onTap 透传到最外层手势，点一次回调一次', (tester) async {
    var taps = 0;
    await pumpScreen(tester, host(card(onTap: () => taps++)));

    expect(gesture(tester).onTap, isNotNull);
    await tester.tapAt(tester.getCenter(find.byType(AnimatedOptionCard)));
    await tester.pumpAndSettle();
    expect(taps, 1);
  });
}
