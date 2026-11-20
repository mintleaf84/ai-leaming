import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'package:mobile_app/shared/widgets/server_address_form.dart';

import '../../../support/fake_network_images.dart';
import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 设置屏冒烟。
///
/// 这屏有一堆开关和弹窗，但真正会「静默出错」的是两件事：
/// 1. 服务器地址输入框有没有**回填当前生效地址**——不回填的话用户以为没配过，
///    随手填一个就把自己的后端换掉了；
/// 2. 数据管理里的出口在不在（清理缓存 / 同步离线记录），这是本地库接线的唯一
///    可见证据。
/// 所以只钉这两条，外加「账号名来自 profile 而不是写死」。
void main() {
  setUpAll(useFakeSecureStorage);

  // 设置页头像是一个写死的 NetworkImage（ui-avatars.com）：测试环境里必须把它
  // 指向本地常量，否则每个用例都会被图片加载失败判红。
  setUpAll(useFakeNetworkImages);

  TextField addressField(WidgetTester tester) {
    return tester.widget<TextField>(
      find.descendant(
        of: find.byType(ServerAddressForm),
        matching: find.byType(TextField),
      ),
    );
  }

  testWidgets('地址已配：输入框回填当前地址，账号名来自 profile', (tester) async {
    await pumpScreen(
      tester,
      const SettingsScreen(),
      overrides: fakeSettings(
        username: '张三',
        baseUrl: 'http://10.0.2.2:3000/api',
      ),
    );
    await tester.pump();

    expect(addressField(tester).controller?.text, 'http://10.0.2.2:3000/api');
    expect(find.text('张三'), findsOneWidget);
  });

  testWidgets('地址未配：输入框为空，但保存入口仍然在', (tester) async {
    await pumpScreen(
      tester,
      const SettingsScreen(),
      overrides: fakeSettings(baseUrl: null),
    );
    await tester.pump();

    expect(addressField(tester).controller?.text, isEmpty);
    expect(find.byType(ServerAddressForm), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(ServerAddressForm),
        matching: find.byType(FilledButton),
      ),
      findsOneWidget,
    );
  });

  testWidgets('数据管理：清理缓存 / 同步离线记录两个入口都在', (tester) async {
    await pumpScreen(
      tester,
      const SettingsScreen(),
      overrides: fakeSettings(cachedCount: 42, pendingCount: 3),
    );
    await tester.pump();
    await tester.pump();

    expect(find.byIcon(AppIcons.cleaningServicesOutlined), findsOneWidget);
    expect(find.byIcon(AppIcons.cloudUploadOutlined), findsOneWidget);

    // 本地库读数真的接到了界面上（不是写死的容量）
    expect(find.textContaining('42'), findsOneWidget);
    expect(find.textContaining('3'), findsWidgets);
  });

  testWidgets('版本行：本地构建没有 BUILD_SHA，回落到固定版本号且不带指纹', (tester) async {
    await pumpScreen(
      tester,
      const SettingsScreen(),
      overrides: fakeSettings(),
    );
    await tester.pump();
    await tester.pump();

    // CI 会用 --dart-define 传 APP_VERSION/BUILD_SHA；测试进程里两者都是空串，
    // 因此这里锁的是「本地构建的回落」这条路径。
    expect(find.text('v1.2.0'), findsOneWidget);
    expect(find.textContaining('·'), findsNothing);
  });
}
