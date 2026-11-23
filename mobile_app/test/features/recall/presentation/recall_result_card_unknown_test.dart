import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_result_card.dart';

/// 结果卡的「未知结论」分支。
///
/// 与 recall_models_test 的解析用例配对：解析层把契约外取值变成 unknown，
/// 这里钉住界面**不把它伪装成任何一档结论**（既不说「记住了」也不说「没记住」）。
/// 外壳与 `recall_widgets_test.dart` 同一套（设计稿 390×884）。
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

RecallReviewResult resultWithRating(String rating) =>
    RecallReviewResult.fromJson(<String, Object?>{
      'verdicts': <String>['ok'],
      'rating': rating,
      'nextDue': '2026-11-30T00:00:00.000Z',
      'pendingItems': null,
      'nextReviewText': '下次 11 月 30 日',
      'duplicate': false,
    });

void main() {
  group('RecallResultCard：未知评分不伪装结论', () {
    testWidgets('契约外的 rating：显示中性的「已提交，需更新」，不显示排期文案', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(RecallResultCard(result: resultWithRating('surprise'))),
      );

      expect(find.textContaining('结论需要新版 App 才能显示'), findsOneWidget);
      // 不能被伪装成任何一档结论：既不展示「下次…」，也不出现「答完了」。
      expect(find.text('下次 11 月 30 日'), findsNothing);
      expect(find.textContaining('答完了'), findsNothing);
    });

    testWidgets('对照组：good 仍走正常结论（未知分支没有吞掉常规路径）', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(RecallResultCard(result: resultWithRating('good'))),
      );

      expect(find.text('下次 11 月 30 日'), findsOneWidget);
      expect(find.textContaining('结论需要新版 App 才能显示'), findsNothing);
    });
  });
}
