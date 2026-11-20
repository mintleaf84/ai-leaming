import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/network/connectivity_provider.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/stats/presentation/stats_provider.dart';

import '../../../support/fake_providers.dart';

/// 首页入口的离线禁用（审计 #20 方案 A）。
///
/// 为什么只钉「记忆卡」：它进去第一件事就是拉会话，断网只会落到一个空屏；
/// 题库/复习/错题/历史都能用本地缓存或已有数据先渲染，不该一刀切禁用。
///
/// 守的线：
/// 1. 离线时卡片**仍然可见**（用户要知道有这个功能），但点不动，并写明原因；
/// 2. 在线时恢复可点，且不出现离线文案；
/// 3. 判定用注入的流，不碰 connectivity_plus 平台通道。
class _FakeStatsController extends StatsController {
  @override
  StatsState build() => const StatsState();

  @override
  Future<void> load() async {
    // 首页挂载时会调 load()，这里不联网。
  }
}

void main() {
  late StreamController<List<ConnectivityResult>> connectivity;

  setUp(() {
    connectivity = StreamController<List<ConnectivityResult>>.broadcast();
  });

  tearDown(() async {
    await connectivity.close();
  });

  Widget harness() {
    return ProviderScope(
      overrides: [
        // 服务端自述支持 recall，否则整张卡会按能力协商隐藏，测不到离线分支。
        contractDecisionProvider.overrideWith(
          (ref) async => const ContractDecision(
            status: ContractCompat.ok,
            meta: ContractMeta(
              contractVersion: 1,
              features: <String>{'recall'},
            ),
          ),
        ),
        statsControllerProvider.overrideWith(_FakeStatsController.new),
        connectivityChangesProvider.overrideWithValue(connectivity.stream),
        // 首页的三张卡会读队列/错题/历史：不桩住就会在用例里发真请求
        ...fakeRecallQueue().cast(),
        ...fakeWrongBook().cast(),
        ...fakeHistory().cast(),
      ],
      child: ScreenUtilInit(
        designSize: const Size(390, 884),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (context, _) => MaterialApp(
          theme: AppTheme.lightTheme,
          home: const DashboardScreen(),
        ),
      ),
    );
  }

  /// 记忆卡自身的 GestureDetector（最近的祖先；底部导航的也是
  /// GestureDetector，但不是「记忆卡」的祖先）。
  GestureDetector recallCardTap(WidgetTester tester) {
    return tester.widget<GestureDetector>(
      find
          .ancestor(
            of: find.text('记忆卡'),
            matching: find.byType(GestureDetector),
          )
          .first,
    );
  }

  testWidgets('离线：记忆卡可见但禁用，并写明「联网后可用」', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    connectivity.add(<ConnectivityResult>[ConnectivityResult.none]);
    await tester.pumpAndSettle();

    expect(find.text('记忆卡'), findsOneWidget, reason: '离线也要让用户看到有这个入口');
    expect(find.text('联网后可用'), findsOneWidget);
    expect(find.text('离线，联网后可进入记忆卡'), findsOneWidget);
    expect(recallCardTap(tester).onTap, isNull, reason: '离线时点进去只会撞空屏，必须禁用');
  });

  testWidgets('在线：记忆卡可点，且没有离线文案', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    connectivity.add(<ConnectivityResult>[ConnectivityResult.wifi]);
    await tester.pumpAndSettle();

    expect(find.text('联网后可用'), findsNothing);
    expect(find.text('离线，联网后可进入记忆卡'), findsNothing);
    expect(recallCardTap(tester).onTap, isNotNull);
  });

  testWidgets('恢复在线：同一张卡从禁用变回可点', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    connectivity.add(<ConnectivityResult>[ConnectivityResult.none]);
    await tester.pumpAndSettle();
    expect(recallCardTap(tester).onTap, isNull);

    connectivity.add(<ConnectivityResult>[ConnectivityResult.mobile]);
    await tester.pumpAndSettle();

    expect(
      recallCardTap(tester).onTap,
      isNotNull,
      reason: '联网后入口必须自动恢复，不需要重启 App',
    );
    expect(find.text('联网后可用'), findsNothing);
  });
}
