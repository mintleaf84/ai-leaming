import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_done_view.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_result_card.dart';

/// 完成屏（`RecallDoneView`）的三条收口路径。
///
/// 这一屏没有按钮，但它同时管着两件容易被写坏的事：
/// 1. 最后一张的结论必须**原样**复用判分屏那块结论卡（同一个信息不能在两处
///    长成两个版本），只有在服务端没给完整 result 时才允许用 `note` 兜底；
/// 2. 连续天数只在服务端给了正数时才出现——客户端算不出学习日（04:00）切换后
///    的连续天数，编一个数字比不显示更糟。
///
/// 外壳与 `recall_result_card_unknown_test.dart` 同一套（设计稿 390×884）：
/// 这里全是纯 widget，没有仓库可假，也没有网络与时间依赖。
Widget wrap(Widget child) {
  return ScreenUtilInit(
    designSize: const Size(390, 884),
    minTextAdapt: true,
    splitScreenMode: true,
    builder: (BuildContext context, Widget? _) => MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(body: child),
    ),
  );
}

RecallReviewResult lastCardResult({
  String rating = 'good',
  List<int>? pendingItems = const <int>[0, 1],
  String nextReviewText = '下次 11 月 30 日',
}) {
  return RecallReviewResult.fromJson(<String, Object?>{
    'verdicts': <String>['miss', 'miss'],
    'rating': rating,
    'nextDue': '2026-11-30T00:00:00.000Z',
    'pendingItems': pendingItems,
    'nextReviewText': nextReviewText,
    'duplicate': false,
  });
}

void main() {
  group('RecallDoneView：今天的回忆做完了', () {
    testWidgets('有最后一张的 result：结论卡原样复用，note 兜底不参与', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          RecallDoneView(
            result: lastCardResult(),
            // 有完整结论时，兜底文案必须被忽略：同一张卡不能出现两份说法。
            note: '这条兜底不该出现在完成屏',
            pendingItems: const <int>[0, 1],
            streakDays: 4,
          ),
        ),
      );

      expect(find.text('✅'), findsOneWidget);
      expect(find.text('今天的回忆做完了'), findsOneWidget);
      expect(find.text('这些卡已经排到明天之后，明天再来就好。'), findsOneWidget);

      // 结论原样复用判分屏那块（同一个信息、同一个版本）
      expect(find.byType(RecallResultCard), findsOneWidget);
      expect(find.text('下次 11 月 30 日'), findsOneWidget);
      expect(find.text('这条兜底不该出现在完成屏'), findsNothing);

      // 服务端给了正数：连续天数才出现
      expect(find.text('已经连续 4 天。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('没有 result 才用 note 兜底；streakDays=0 时不编连续天数', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const RecallDoneView(
            result: null,
            note: '明天只重测这 1 条',
            pendingItems: null,
            streakDays: 0,
          ),
        ),
      );

      expect(find.text('今天的回忆做完了'), findsOneWidget);
      // 兜底文案出现在卡片位置，而不是凭空造一张结论卡
      expect(find.text('明天只重测这 1 条'), findsOneWidget);
      expect(find.byType(RecallResultCard), findsNothing);
      // 0 天 = 服务端没说：宁可不显示，也不编一个数字
      expect(find.textContaining('已经连续'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('result 与 note 都没有：只留收口文案，不留空卡片', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const RecallDoneView(
            result: null,
            note: '',
            pendingItems: null,
            streakDays: 7,
          ),
        ),
      );

      expect(find.text('今天的回忆做完了'), findsOneWidget);
      expect(find.byType(RecallResultCard), findsNothing);
      // 空字符串的 note 也不能渲染成一张空壳卡片
      expect(
        find.byWidgetPredicate(
          (Widget widget) =>
              widget is Container &&
              find
                  .descendant(
                    of: find.byWidget(widget),
                    matching: find.text(''),
                  )
                  .evaluate()
                  .isNotEmpty,
        ),
        findsNothing,
      );
      // 连续天数与结论无关：最后一张没结论时照样如实报天数
      expect(find.text('已经连续 7 天。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
