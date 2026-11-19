import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/shared/widgets/server_address_form.dart';

import '../../support/fake_providers.dart';
import '../../support/pump_screen.dart';

/// 服务器地址表单冒烟。
///
/// 这个表单是「App 能不能连上后端」的唯一入口，所以两条必须成立：
/// 1. 非法地址**不能**写进存储，且错误要出现在输入框下方（`errorText`），
///    而不是弹个 toast 就没了；
/// 2. 合法地址保存后要真的落到存储里，并且规范化（去掉尾部斜杠）。
void main() {
  // 换 origin 保存时表单会顺手清掉旧服务器的 JWT（同一个 secure storage）：
  // 不装内存桩就会去碰平台通道。
  setUpAll(useFakeSecureStorage);

  Widget host(Widget child) => Scaffold(
    body: Padding(padding: const EdgeInsets.all(16), child: child),
  );

  TextField field(WidgetTester tester) =>
      tester.widget<TextField>(find.byType(TextField));

  testWidgets('非法地址：错误显示在输入框上，存储不被写入', (tester) async {
    final store = FakeServerBaseUrlStore();

    await pumpScreen(
      tester,
      host(const ServerAddressForm()),
      overrides: fakeServerConfig(baseUrl: null, store: store),
    );

    await tester.enterText(find.byType(TextField), '不是地址');
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    expect(field(tester).decoration?.errorText, isNotNull);
    expect(store.value, isNull);
  });

  testWidgets('合法地址：写进存储并规范化', (tester) async {
    final store = FakeServerBaseUrlStore();

    await pumpScreen(
      tester,
      host(const ServerAddressForm()),
      overrides: fakeServerConfig(baseUrl: null, store: store),
    );

    await tester.enterText(find.byType(TextField), 'http://10.0.2.2:3000/api/');
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    await tester.pump();

    expect(store.value, 'http://10.0.2.2:3000/api');
    expect(field(tester).decoration?.errorText, isNull);
  });

  testWidgets('初始值：给了 initialValue 就回填，且保存后回调带上规范化地址', (tester) async {
    String? saved;
    final store = FakeServerBaseUrlStore('http://old.example.com/api');

    await pumpScreen(
      tester,
      host(
        ServerAddressForm(
          initialValue: 'http://old.example.com/api',
          onSaved: (value) => saved = value,
        ),
      ),
      overrides: fakeServerConfig(
        baseUrl: 'http://old.example.com/api',
        store: store,
      ),
    );

    expect(field(tester).controller?.text, 'http://old.example.com/api');

    await tester.enterText(
      find.byType(TextField),
      'https://new.example.com/api',
    );
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    await tester.pump();

    expect(saved, 'https://new.example.com/api');
    expect(store.value, 'https://new.example.com/api');
  });
}
