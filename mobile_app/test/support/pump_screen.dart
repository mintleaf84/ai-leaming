import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_theme.dart';

/// 屏级冒烟测试的统一入口。
///
/// 每个屏的 widget 测试都要重复这一串样板：固定窗口尺寸 → 初始化 ScreenUtil →
/// 挂真实主题（`context.colors` 取不到会直接 assert）→ 包 ProviderScope。
/// 集中在这里的好处是**版式口径只有一份**：设计稿尺寸、字号缩放、键盘模拟
/// 全走同一条路径，不会出现「A 屏在 800×600 默认窗口下过、B 屏在 375×667 下挂」。
///
/// 为什么用 [ScreenUtilInit] 而不是 `ScreenUtil.init(context, ...)`：后者要求
/// 传入一个已经带 MediaQuery 的 context，测试里唯一的那个 context 就是被测
/// widget 自己，拿不到「屏外」的 context；`ScreenUtilInit` 是库作者给出的
/// 等价写法（内部仍然是 `ScreenUtil.init`），且是生产 `main.dart` 用的同一套。
///
/// [textScale] 走 `MediaQuery.textScaler`（不是 `MediaQueryData.textScaleFactor`，
/// 后者在新版 Flutter 已废弃）。缩放必须挂在 `MaterialApp.builder` 里：
/// 挂在外面会被 MaterialApp 自己根据 View 重建的 MediaQuery 覆盖掉。
///
/// [viewInsetsBottom] 模拟键盘弹出（软键盘占位）。有它的用例才能真正验证
/// 「键盘弹起后关键内容不被遮住/不溢出」——只改字号不模拟键盘是测不到的。
/// [overrides] 的类型是 `List<Object>` 而不是 `List<Override>`：Riverpod 3 把
/// `Override` 挪到了 `package:riverpod/misc.dart`，`flutter_riverpod` 不再导出它；
/// 直接写 `List<Override>` 会编译失败，而为了一个类型别名去改 `pubspec.yaml`
/// 加依赖不值得。传进来的都是 override 实例，`cast()` 在运行期原样通过。
Future<void> pumpScreen(
  WidgetTester tester,
  Widget child, {
  List<Object> overrides = const <Object>[],
  double textScale = 1.0,
  double viewInsetsBottom = 0,
}) async {
  // 设计稿尺寸 = 测试窗口尺寸，ScreenUtil 的缩放系数正好是 1.0；
  // 需要验证缩放时只动 textScale，不掺入设备尺寸变量。
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(375, 667);
  tester.view.viewInsets = FakeViewPadding(bottom: viewInsetsBottom);
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides.cast(),
      child: ScreenUtilInit(
        designSize: const Size(375, 667),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (BuildContext context, Widget? _) => MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (BuildContext context, Widget? appChild) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: appChild ?? const SizedBox.shrink(),
          ),
          home: child,
        ),
      ),
    ),
  );

  // 首帧之后还会有一批 `Future.microtask` / provider 初始化：统一多推一帧，
  // 让「挂载即发请求」的屏进到稳定的第一态（加载中或数据态），
  // 调用方不用在每个用例里自己数帧。
  await tester.pump();
}

/// 断言「这一屏没有抛出布局异常」。
///
/// `tester.takeException()` 会把 RenderFlex overflow、断言失败等一次性取走；
/// 直接把它包成一个可读断言，溢出用例里就不用每条都写一遍。
void expectNoLayoutError(WidgetTester tester, {String? reason}) {
  expect(tester.takeException(), isNull, reason: reason);
}
