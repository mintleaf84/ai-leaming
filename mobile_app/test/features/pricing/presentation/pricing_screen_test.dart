import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/pricing/presentation/pricing_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 定价屏：成功用服务端价格，**失败静默降级到内置套餐**。
///
/// 第二条是代码注释里写明的产品行为（`pricing_screen.dart` 的 `_loadPlans`
/// catch），必须有用例锁住：断网时页面不能空白，也不能弹出错误框打断用户，
/// 而是展示内置的三档套餐。服务端返回空列表同样走内置套餐。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  List<Object> pricingOverrides(RecordingAdapter adapter) => <Object>[
    dioProvider.overrideWithValue(fakeDio(adapter)),
  ];

  testWidgets('成功：展示服务端返回的套餐名与价格', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(<String, dynamic>{
        'plans': <Map<String, dynamic>>[
          <String, dynamic>{
            'name': '季卡',
            'slug': 'pro',
            'priceCents': 12300,
            'features': <String>['无限练习', '优先响应'],
          },
        ],
      }),
    );

    await pumpScreen(
      tester,
      const PricingScreen(),
      overrides: pricingOverrides(adapter),
    );
    await settle(tester);

    expect(adapter.requests.single.path, '/billing/plans');
    expect(find.text('季卡'), findsOneWidget);
    expect(find.text('¥123/月'), findsOneWidget);
    expect(find.text('无限练习'), findsOneWidget);
    // 用了服务端数据就不该再出现内置套餐
    expect(find.text('基础版'), findsNothing);
    expect(find.text('专业版'), findsNothing);
  });

  testWidgets('接口失败：静默降级到内置三档套餐，不弹错误', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => offlineException(options),
    );

    await pumpScreen(
      tester,
      const PricingScreen(),
      overrides: pricingOverrides(adapter),
    );
    await settle(tester);

    expect(find.text('免费版'), findsOneWidget);
    expect(find.text('基础版'), findsOneWidget);
    expect(find.text('专业版'), findsOneWidget);
    expect(find.text('免费'), findsOneWidget);
    expect(find.text('¥19/月'), findsOneWidget);
    expect(find.text('¥39/月'), findsOneWidget);
    // 降级是「静默」的：不出现错误视图/重试按钮
    expect(find.text('加载失败'), findsNothing);
    expect(find.text('重试'), findsNothing);
  });

  testWidgets('服务端返回空列表：同样回落到内置套餐', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(<String, dynamic>{
        'plans': <Map<String, dynamic>>[],
      }),
    );

    await pumpScreen(
      tester,
      const PricingScreen(),
      overrides: pricingOverrides(adapter),
    );
    await settle(tester);

    expect(find.text('免费版'), findsOneWidget);
    expect(find.text('专业版'), findsOneWidget);
  });
}
