import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/server_config.dart';
import 'package:mobile_app/shared/widgets/server_config_gate.dart';

/// `ServerConfigGate` 是「没有任何可用后端地址」时挡在整个 App 前的闸门。
///
/// 这个测试守的线：
/// 1. **未配置就必须挡住**：直接渲染子界面 = 每个页面各自转圈或抛一屏 Dio 错误，
///    用户看到的是一堆"加载失败"而不是"请填地址"。所以未配置时子界面必须不可见，
///    且要给出配置入口；
/// 2. **配置完成后立刻放行**：闸门 `ref.watch` 的是 `serverConfigProvider`，
///    用户填完地址保存后必须当帧切到主界面，不需要重启 App；
/// 3. **未配置时是"配置页"而不是"加载中"**：不出现 CircularProgressIndicator
///    （这正是它存在的原因）。
///
/// 全部用内存假 store + `initialServerBaseUrlProvider` override，不碰 secure
/// storage 平台通道（真实存储路径由 `test/core/network/server_config_test.dart`
/// 负责）。
class _FakeServerBaseUrlStore implements ServerBaseUrlStore {
  String? value;
  int writeCount = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String baseUrl) async {
    value = baseUrl;
    writeCount++;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  late _FakeServerBaseUrlStore store;

  setUp(() {
    store = _FakeServerBaseUrlStore();
  });

  /// 与 `lib/main.dart` 一致：ScreenUtilInit 在外、MaterialApp 在内。
  /// 生产上闸门挂在 `MaterialApp.router` 的 builder 里，这里用 `home:` 等价替代。
  Widget harness({required String? initialBaseUrl, required Widget child}) {
    return ProviderScope(
      overrides: [
        initialServerBaseUrlProvider.overrideWithValue(initialBaseUrl),
        serverBaseUrlStoreProvider.overrideWithValue(store),
      ],
      child: ScreenUtilInit(
        designSize: const Size(390, 884),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (BuildContext context, Widget? _) =>
            MaterialApp(home: ServerConfigGate(child: child)),
      ),
    );
  }

  const appContent = Center(child: Text('app-content'));

  group('未配置：挡住子界面，给出配置入口', () {
    testWidgets('子界面不渲染，出现「需要配置服务器地址」和表单', (WidgetTester tester) async {
      await tester.pumpWidget(harness(initialBaseUrl: null, child: appContent));
      await tester.pumpAndSettle();

      expect(find.text('app-content'), findsNothing);
      expect(find.text('需要配置服务器地址'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('保存'), findsOneWidget);
    });

    testWidgets('是配置页而不是加载中：不出现任何转圈', (WidgetTester tester) async {
      await tester.pumpWidget(harness(initialBaseUrl: null, child: appContent));
      await tester.pumpAndSettle();

      expect(
        find.byType(CircularProgressIndicator),
        findsNothing,
        reason: '未配置的呈现应是"请填地址"，不是无限加载',
      );
    });

    testWidgets('配置页自带 MaterialApp/Overlay，输入框可用（不抛 No Overlay）', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(harness(initialBaseUrl: null, child: appContent));
      await tester.pumpAndSettle();

      // 这条用例钉住 server_config_gate.dart 里那段「为什么配置页要自带
      // MaterialApp」的注释：文本框的文本选择浮层要求祖先有 Overlay。
      expect(
        find.descendant(
          of: find.byType(ServerConfigGate),
          matching: find.byType(Overlay),
        ),
        findsOneWidget,
      );

      await tester.enterText(
        find.byType(TextField),
        'http://10.0.2.2:3000/api',
      );
      await tester.pump();

      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'http://10.0.2.2:3000/api',
      );
    });
  });

  group('已配置：放行子界面', () {
    testWidgets('子界面直接渲染，配置页不存在', (WidgetTester tester) async {
      await tester.pumpWidget(
        harness(initialBaseUrl: 'http://10.0.2.2:3000/api', child: appContent),
      );
      await tester.pumpAndSettle();

      expect(find.text('app-content'), findsOneWidget);
      expect(find.text('需要配置服务器地址'), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('配置完成后立即放行（watch 生效，不需要重启）', () {
    testWidgets('在配置页填地址并保存：子界面当帧出现', (WidgetTester tester) async {
      await tester.pumpWidget(harness(initialBaseUrl: null, child: appContent));
      await tester.pumpAndSettle();

      expect(find.text('app-content'), findsNothing);

      await tester.enterText(
        find.byType(TextField),
        'http://10.0.2.2:3000/api',
      );
      await tester.tap(find.text('保存'));
      await tester.pumpAndSettle();

      expect(
        store.value,
        'http://10.0.2.2:3000/api',
        reason: '保存必须落盘，否则下次启动又回到未配置',
      );
      expect(store.writeCount, 1);
      expect(find.text('app-content'), findsOneWidget);
      expect(find.text('需要配置服务器地址'), findsNothing);
    });

    testWidgets('地址非法时留在配置页，并显示错误文案', (WidgetTester tester) async {
      await tester.pumpWidget(harness(initialBaseUrl: null, child: appContent));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'localhost:3000/api');
      await tester.tap(find.text('保存'));
      await tester.pumpAndSettle();

      expect(find.text('app-content'), findsNothing);
      expect(store.writeCount, 0);
      expect(find.text('地址需以 http:// 或 https:// 开头，并包含主机名'), findsOneWidget);
    });
  });
}
