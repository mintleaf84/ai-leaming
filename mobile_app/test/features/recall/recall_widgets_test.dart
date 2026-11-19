import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_layout.dart';
import 'package:mobile_app/features/recall/presentation/widgets/recall_tones.dart';

/// 回忆流程公用外壳与语义配色的护栏。
///
/// 这两块是四个 recall 屏共用的"纸与墨"：改坏一个，四屏一起歪。
void main() {
  Widget wrap(Widget child, {ThemeData? theme}) {
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) => MaterialApp(
        theme: theme ?? AppTheme.lightTheme,
        home: Scaffold(body: child),
      ),
    );
  }

  group('RecallTone 语义配色', () {
    testWidgets('ok=true 取成功色，ok=false 取警告色，两档前景不同', (
      WidgetTester tester,
    ) async {
      late RecallTone ok;
      late RecallTone pending;
      await tester.pumpWidget(
        wrap(
          Builder(
            builder: (BuildContext context) {
              ok = RecallTone.of(context, ok: true);
              pending = RecallTone.of(context, ok: false);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(ok.foreground, AppTheme.successColor);
      expect(pending.foreground, AppTheme.warningColor);
      expect(ok.background, isNot(pending.background));
      expect(ok.border, isNot(pending.border));
    });

    testWidgets('暗色下同色相、透明度更高（叠在深底上仍分得清）', (
      WidgetTester tester,
    ) async {
      late RecallTone dark;
      await tester.pumpWidget(
        wrap(
          Builder(
            builder: (BuildContext context) {
              dark = RecallTone.of(context, ok: true);
              return const SizedBox.shrink();
            },
          ),
          theme: AppTheme.darkTheme,
        ),
      );

      // 暗色：同色相，但底色/描边透明度更高（0.14 / 0.38）
      expect(dark.foreground, AppTheme.successColor);
      expect(dark.background.a, closeTo(0.14, 0.001));
      expect(dark.border.a, closeTo(0.38, 0.001));
    });

    testWidgets('cardBorder 与 cardRadius 取自主题/统一半径', (
      WidgetTester tester,
    ) async {
      late BorderSide side;
      await tester.pumpWidget(
        wrap(
          Builder(
            builder: (BuildContext context) {
              side = RecallTone.cardBorder(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(side.color, AppTheme.lightTheme.dividerColor);
      expect(RecallTone.cardRadius.topLeft.x, greaterThan(0));
    });
  });

  group('布局外壳', () {
    testWidgets('RecallCardShell 渲染子组件并套上卡片底色', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const RecallCardShell(
            child: Text('卡片内容'),
          ),
        ),
      );

      expect(find.text('卡片内容'), findsOneWidget);
      final Container box = tester.widget<Container>(
        find.ancestor(
          of: find.text('卡片内容'),
          matching: find.byType(Container),
        ).first,
      );
      expect(box.decoration, isA<BoxDecoration>());
    });

    testWidgets('RecallCardShell 支持自定义 padding', (WidgetTester tester) async {
      await tester.pumpWidget(
        wrap(
          const RecallCardShell(
            padding: EdgeInsets.zero,
            child: Text('无内边距'),
          ),
        ),
      );

      expect(find.text('无内边距'), findsOneWidget);
    });

    testWidgets('RecallCenteredBlock 在有限高度里居中且可滚动', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const RecallCenteredBlock(child: Text('单块内容')),
        ),
      );

      expect(find.text('单块内容'), findsOneWidget);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
    });
  });
}
