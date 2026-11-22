import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/app_version.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/shared/widgets/contract_gate.dart';

/// 版本错位闸的界面护栏（见 docs/mobile-compat.md §3）。
///
/// 这里只测**呈现与出口**：判定规则本身在 `test/core/compat/evaluate_contract_test.dart`
/// 里测。两组测试的分界线很重要——把判定塞进 widget 测试，就是在界面里偷偷
/// 复刻一套比较逻辑，而"界面和判定各说各话"正是这个功能要消灭的问题。
void main() {
  /// 把测试视口固定成真机尺寸：ScreenUtil 的缩放系数由视口推出，
  /// 默认的 800×600 会让字号被放大到两倍，溢出断言就失去了意义。
  void setSurface(
    WidgetTester tester, {
    double width = 390,
    double height = 844,
  }) {
    tester.view.physicalSize = Size(width * 3, height * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Widget buildGate({
    required ContractDecision decision,
    bool dark = false,
    TextScaler? textScaler,
    VoidCallback? onFetch,
  }) {
    return ProviderScope(
      overrides: [
        // 用 overrideWith（而不是 overrideWithValue）：只有它每次重新求值，
        // 「点重试会不会真的重新协商」才测得到。
        contractDecisionProvider.overrideWith((ref) {
          onFetch?.call();
          return decision;
        }),
      ],
      child: ScreenUtilInit(
        designSize: const Size(390, 884),
        builder: (context, child) => MaterialApp(
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          builder: textScaler == null
              ? null
              : (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(textScaler: textScaler),
                  child: child ?? const SizedBox.shrink(),
                ),
          home: const ContractGate(
            child: Scaffold(body: Center(child: Text('APP_BODY'))),
          ),
        ),
      ),
    );
  }

  const serverTooOld = ContractDecision(
    status: ContractCompat.serverTooOld,
    meta: ContractMeta(contractVersion: 0),
  );

  group('不阻断的状态', () {
    testWidgets('服务端不可达：直接渲染 App 本体，不出现任何阻断屏', (tester) async {
      setSurface(tester);
      await tester.pumpWidget(
        buildGate(
          decision: const ContractDecision(
            status: ContractCompat.serverUnreachable,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('APP_BODY'), findsOneWidget);
      expect(find.text('服务端版本过旧'), findsNothing);
      expect(find.text('需要更新 App'), findsNothing);
      // 断网也不该冒出一条"服务端过旧"的提示：那是判定层的错，不是用户的错。
      expect(find.text('服务端版本过旧，在线功能可能不可用。'), findsNothing);
    });

    testWidgets('协商未完成：先渲染 App 本体（首次绘制不等网络）', (tester) async {
      setSurface(tester);
      // 用一个永不完成的 Future 模拟"请求还在路上"。
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contractDecisionProvider.overrideWith(
              (ref) => Completer<ContractDecision>().future,
            ),
          ],
          child: ScreenUtilInit(
            designSize: const Size(390, 884),
            builder: (context, child) => MaterialApp(
              theme: AppTheme.lightTheme,
              home: const ContractGate(
                child: Scaffold(body: Center(child: Text('APP_BODY'))),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('APP_BODY'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('未验证：给可关闭提示条，关掉后不再出现', (tester) async {
      setSurface(tester);
      await tester.pumpWidget(
        buildGate(
          decision: const ContractDecision(
            status: ContractCompat.clientUnverified,
            meta: ContractMeta(contractVersion: 2),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('APP_BODY'), findsOneWidget);
      expect(find.text('这个 App 未与当前服务端版本一起验证过。'), findsOneWidget);

      await tester.tap(find.byTooltip('关闭提示'));
      await tester.pump();

      expect(find.text('这个 App 未与当前服务端版本一起验证过。'), findsNothing);
      expect(find.text('APP_BODY'), findsOneWidget);
    });
  });

  group('serverTooOld（App 新 / 服务端旧）', () {
    testWidgets('阻断屏说清版本差，且「先离线练习」能进 App 并留下常驻提示', (tester) async {
      setSurface(tester);
      await tester.pumpWidget(buildGate(decision: serverTooOld));
      await tester.pump();

      expect(find.text('服务端版本过旧'), findsOneWidget);
      expect(find.text('APP_BODY'), findsNothing);
      // 「需要 ≥ N，当前 M」两行事实都要在，用户才能拿去和部署方核对。
      expect(find.text('≥ 1'), findsOneWidget);
      expect(find.text('0'), findsOneWidget);

      await tester.tap(find.text('先离线练习'));
      await tester.pump();

      expect(find.text('APP_BODY'), findsOneWidget);
      expect(find.text('服务端版本过旧，在线功能可能不可用。'), findsOneWidget);
    });

    testWidgets('「重试」会重新协商（provider 重算一次）', (tester) async {
      setSurface(tester);
      var fetchCount = 0;
      await tester.pumpWidget(
        buildGate(decision: serverTooOld, onFetch: () => fetchCount++),
      );
      await tester.pump();
      expect(fetchCount, 1);

      await tester.tap(find.text('重试'));
      await tester.pump();

      expect(fetchCount, 2);
      // 结果仍是 serverTooOld：停在阻断屏，不闪一下 App 本体。
      expect(find.text('APP_BODY'), findsNothing);
      expect(find.text('服务端版本过旧'), findsOneWidget);
    });
  });

  group('clientTooOld（App 旧 / 服务端要求更高版本）', () {
    const downloadUrl = 'https://example.com/app-release.apk';
    const clientTooOld = ContractDecision(
      status: ContractCompat.clientTooOld,
      meta: ContractMeta(
        contractVersion: 1,
        minClientVersion: '1.2.0',
        downloadUrl: downloadUrl,
      ),
    );

    testWidgets('「复制下载地址」写进剪贴板，并给出一次明确反馈', (tester) async {
      setSurface(tester);
      final clipboardCalls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'Clipboard.setData') {
              clipboardCalls.add(call);
            }
            return null;
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );

      await tester.pumpWidget(buildGate(decision: clientTooOld));
      await tester.pump();

      expect(find.text('需要更新 App'), findsOneWidget);
      expect(find.text('≥ 1.2.0'), findsOneWidget);
      // 显示的是当前客户端的真实版本；引用常量，避免每次发版都要改测试。
      expect(find.text(appVersion), findsOneWidget);

      await tester.tap(find.text('复制下载地址'));
      await tester.pump();

      expect(clipboardCalls, hasLength(1));
      expect(
        (clipboardCalls.single.arguments as Map<Object?, Object?>)['text'],
        downloadUrl,
      );
      expect(find.text('下载地址已复制，可在浏览器里粘贴打开。'), findsOneWidget);

      // 次出口仍然可用：本项目的 APK 是手动安装的，没有商店可以强制升级。
      await tester.tap(find.text('仍然进入（可能出错）'));
      await tester.pump();
      expect(find.text('APP_BODY'), findsOneWidget);
    });

    testWidgets('没有下载地址时不显示「复制」，改指向管理员', (tester) async {
      setSurface(tester);
      await tester.pumpWidget(
        buildGate(
          decision: const ContractDecision(
            status: ContractCompat.clientTooOld,
            meta: ContractMeta(contractVersion: 1, minClientVersion: '1.2.0'),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('复制下载地址'), findsNothing);
      expect(find.text('请联系管理员获取新版安装包。'), findsOneWidget);
      // 唯一可走的路变成主操作，而不是"没有主操作 + 一个藏在下面的次操作"。
      expect(find.text('仍然进入（可能出错）'), findsOneWidget);
    });
  });

  group('能力协商', () {
    test('recallEntryAvailable：只有服务端明确说没有 recall 时才隐藏', () {
      expect(recallEntryAvailable(null), isTrue, reason: '协商未完成时乐观处理');
      expect(
        recallEntryAvailable(
          const ContractDecision(status: ContractCompat.serverUnreachable),
        ),
        isTrue,
        reason: '断网不能把入口藏起来',
      );
      expect(
        recallEntryAvailable(
          const ContractDecision(
            status: ContractCompat.ok,
            meta: ContractMeta(contractVersion: 1, features: {'questions'}),
          ),
        ),
        isFalse,
      );
      expect(
        recallEntryAvailable(
          const ContractDecision(
            status: ContractCompat.ok,
            meta: ContractMeta(
              contractVersion: 1,
              features: {'questions', 'recall'},
            ),
          ),
        ),
        isTrue,
      );
    });
  });

  group('窄屏与放大字号', () {
    // 375 宽 + 1.3 倍字号是最容易溢出的组合；深色模式顺带回归配色。
    for (final dark in [false, true]) {
      testWidgets('375 宽 / 1.3 倍字号下阻断屏不溢出（dark=$dark）', (tester) async {
        setSurface(tester, width: 375, height: 812);
        await tester.pumpWidget(
          buildGate(
            decision: serverTooOld,
            dark: dark,
            textScaler: const TextScaler.linear(1.3),
          ),
        );
        await tester.pump();
        // 阻断屏可以滚动，但任何溢出都会在这里变成异常。
        expect(tester.takeException(), isNull);
        expect(find.text('服务端版本过旧'), findsOneWidget);

        await tester.drag(
          find.byType(SingleChildScrollView),
          const Offset(0, -200),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
