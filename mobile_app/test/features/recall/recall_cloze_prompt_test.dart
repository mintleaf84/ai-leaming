import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_cloze_prompt.dart';

/// 填空卡题干的护栏。
///
/// 这块的规则最容易在改动中被破坏：`【　】` 必须被换成带序号的可视空位、
/// 没被本次呈现的空位要压暗成 `·`、题干原文不能丢字。
void main() {
  Widget wrap(Widget child) {
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) => MaterialApp(
        theme: AppTheme.lightTheme,
        home: Scaffold(body: Center(child: child)),
      ),
    );
  }

  testWidgets('把每个【　】渲染成带序号的空位，题干其余文字不丢', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        const RecallClozePrompt(
          prompt: '教育的本质是【　】，其目的是【　】。',
          presented: <int>[0, 1],
        ),
      ),
    );

    // 题干前后文字保留
    expect(find.textContaining('教育的本质是'), findsOneWidget);
    expect(find.textContaining('其目的是'), findsOneWidget);
    // 占位符本身不再以原文形式出现
    expect(find.textContaining('【　】'), findsNothing);
    // 两个空位 = 两个序号
    expect(find.text('1'), findsWidgets);
    expect(find.text('2'), findsWidgets);
  });

  testWidgets('未被本次呈现的空位显示为压暗的点', (WidgetTester tester) async {
    await tester.pumpWidget(
      wrap(
        const RecallClozePrompt(
          prompt: 'A【　】B【　】C【　】',
          presented: <int>[0],
        ),
      ),
    );

    // 只呈现第 1 个空，其余两个显示 ·
    expect(find.text('·'), findsNWidgets(2));
    expect(find.text('1'), findsWidgets);
  });

  testWidgets('compact / fontSize 只影响排版，不影响内容', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        const RecallClozePrompt(
          prompt: '唯一空位【　】',
          presented: <int>[0],
          fontSize: 14,
          compact: true,
        ),
      ),
    );

    expect(find.textContaining('唯一空位'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('没有占位符时原样渲染题干', (WidgetTester tester) async {
    await tester.pumpWidget(
      wrap(const RecallClozePrompt(prompt: '纯文本题干', presented: <int>[])),
    );

    expect(find.textContaining('纯文本题干'), findsOneWidget);
  });
}
