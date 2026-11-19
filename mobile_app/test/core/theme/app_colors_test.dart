import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_colors.dart';
import 'package:mobile_app/core/theme/app_theme.dart';

/// 语义色层的护栏（见 docs/ui-audit-2026-11-20.md #1/#2）。
///
/// 这一层是全站颜色的唯一来源：它挂了、值被改错，20 个屏会一起错。
void main() {
  Widget wrap(Widget Function(BuildContext context) builder) {
    // AppTheme 里大量 .sp/.w/.h 依赖 ScreenUtil 初始化，配置与 lib/main.dart 一致。
    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (BuildContext context, Widget? _) => builder(context),
    );
  }

  group('AppColors 值', () {
    test('亮/暗两套基底色与品牌色各自成对，不是同一份', () {
      expect(AppColors.light.background, const Color(0xFFF7F7F5));
      expect(AppColors.dark.background, const Color(0xFF191919));
      expect(AppColors.light.surface, Colors.white);
      expect(AppColors.dark.surface, const Color(0xFF2C2C2C));
      expect(AppColors.light.primary, const Color(0xFF37352F));
      expect(AppColors.dark.primary, const Color(0xFFE6E6E6));
      expect(AppColors.light.text, isNot(AppColors.dark.text));
      expect(AppColors.light.textSecondary, isNot(AppColors.dark.textSecondary));
      expect(AppColors.light.border, isNot(AppColors.dark.border));
    });

    test('暗色下 brand/accent 实底必须配深前景，否则白字看不见', () {
      // 亮色：深底 ad 白字；暗色：浅底深字。这两组一旦同色，暗色主题就会「白字压白底」。
      expect(AppColors.light.onPrimary, Colors.white);
      expect(AppColors.dark.onPrimary, const Color(0xFF191919));
      expect(AppColors.light.onAccent, Colors.white);
      expect(AppColors.dark.onAccent, const Color(0xFF0E1A2E));
      expect(AppColors.light.onSuccess, Colors.white);
      expect(AppColors.light.onError, Colors.white);
    });

    test('状态色三件套 + 容器色都不同，不能混用', () {
      final AppColors c = AppColors.light;
      expect(c.success, isNot(c.error));
      expect(c.warning, isNot(c.error));
      expect(c.successContainer, isNot(c.success));
      expect(c.errorContainer, isNot(c.error));
      expect(c.warningContainer, isNot(c.warning));
    });
  });

  group('AppColors 行为', () {
    test('copyWith 只覆盖传入字段', () {
      final AppColors patched = AppColors.light.copyWith(
        success: const Color(0xFF00FF00),
        onAccent: const Color(0xFF0000FF),
      );
      expect(patched.success, const Color(0xFF00FF00));
      expect(patched.onAccent, const Color(0xFF0000FF));
      // 未传的字段保持原值
      expect(patched.error, AppColors.light.error);
      expect(patched.background, AppColors.light.background);
      expect(patched.text, AppColors.light.text);
    });

    test('lerp 两端返回原值，中点介于两者之间', () {
      const AppColors light = AppColors.light;
      const AppColors dark = AppColors.dark;

      expect(light.lerp(dark, 0).background, light.background);
      expect(light.lerp(dark, 1).background, dark.background);

      final AppColors mid = light.lerp(dark, 0.5);
      expect(mid.background, isNot(light.background));
      expect(mid.background, isNot(dark.background));

      // other == null 时原样返回（ThemeExtension 的 lerp 允许 null）
      expect(light.lerp(null, 0.5), light);
    });
  });

  group('主题挂载', () {
    testWidgets('两个 ThemeData 都挂了 AppColors 扩展', (WidgetTester tester) async {
      // AppTheme 用了 screenutil 的 .sp，必须先初始化才能读 ThemeData。
      late AppColors lightSeen;
      late AppColors darkSeen;
      await tester.pumpWidget(
        wrap(
          (BuildContext context) {
            lightSeen = AppTheme.lightTheme.extension<AppColors>()!;
            darkSeen = AppTheme.darkTheme.extension<AppColors>()!;
            return const SizedBox.shrink();
          },
        ),
      );

      expect(lightSeen, AppColors.light);
      expect(darkSeen, AppColors.dark);
    });

    testWidgets('context.colors 取到的是当前主题那一套', (WidgetTester tester) async {
      late AppColors seen;
      await tester.pumpWidget(
        wrap(
          (BuildContext context) => MaterialApp(
            theme: AppTheme.darkTheme,
            home: Builder(
              builder: (BuildContext inner) {
                seen = inner.colors;
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      );

      expect(seen.background, AppColors.dark.background);
      expect(seen.text, AppColors.dark.text);
      // 换主题后取到的是另一套
      expect(seen.primary, isNot(AppColors.light.primary));
    });
  });
}
