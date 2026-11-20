import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile_app/core/sync/sync_providers.dart';
import 'package:mobile_app/core/sync/sync_service.dart';
import 'package:mobile_app/features/practice/presentation/widgets/device_migration_panel.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 守的是 §30 P1 的判据：「有待同步 → 同步 → 清零」与「同步失败不谎报」。
///
/// 三条用例分别对应三种真实状态：
/// 1. 有待同步：必须出现「换机前必须同步，否则这部分作答会丢」，不是只报数字；
/// 2. 同步成功：本地待同步真的归零，才显示「已同步，可以换机了」；
/// 3. 同步失败：保留条数 + 显示失败原因，**不得**出现「可以换机了」。
///
/// 特别钉住第 3 条：`SyncService.flush()` 对单个会话失败是收集错误返回、
/// 不抛异常——只看「没抛异常」就会把失败当成功，换机后这批作答就永久丢了。
void main() {
  setUpAll(useFakeSecureStorage);

  Widget host() => const Scaffold(
    body: SafeArea(child: SingleChildScrollView(child: DeviceMigrationPanel())),
  );

  testWidgets('有待同步：显示条数与丢失警告，并给出立即同步入口', (tester) async {
    final store = FakeLocalPracticeStore();
    when(() => store.pendingCount()).thenAnswer((_) async => 3);

    await pumpScreen(
      tester,
      host(),
      overrides: <Object>[
        localPracticeStoreProvider.overrideWithValue(store),
        syncServiceProvider.overrideWithValue(FakeSyncService()),
      ],
    );
    await tester.pump();

    expect(find.text('换机前检查'), findsOneWidget);
    expect(find.text('待同步 3 条'), findsOneWidget);
    expect(find.text('换机前必须同步，否则这部分作答会丢'), findsOneWidget);
    expect(find.text('立即同步'), findsOneWidget);
    expect(find.text('已同步，可以换机了'), findsNothing);
  });

  testWidgets('同步成功：待同步归零后才显示「已同步，可以换机了」', (tester) async {
    final store = FakeLocalPracticeStore();
    var calls = 0;
    when(() => store.pendingCount()).thenAnswer((_) async {
      calls++;
      // 第一次是 initState 的检查，第二次是同步后的复核。
      return calls == 1 ? 3 : 0;
    });

    final sync = FakeSyncService();
    when(() => sync.flush()).thenAnswer(
      (_) async => const SyncResult(sessions: 1, answers: 3, duplicated: 0),
    );

    await pumpScreen(
      tester,
      host(),
      overrides: <Object>[
        localPracticeStoreProvider.overrideWithValue(store),
        syncServiceProvider.overrideWithValue(sync),
      ],
    );
    await tester.pump();
    expect(find.text('待同步 3 条'), findsOneWidget);

    await tester.tap(find.text('立即同步'));
    await tester.pump();
    await tester.pump();

    expect(find.text('已同步，可以换机了'), findsOneWidget);
    expect(find.textContaining('待同步'), findsNothing);
    expect(find.textContaining('换机前必须同步'), findsNothing);
    verify(() => sync.flush()).called(1);
  });

  testWidgets('同步失败：保留条数并显示原因，绝不宣称可以换机', (tester) async {
    final store = FakeLocalPracticeStore();
    when(() => store.pendingCount()).thenAnswer((_) async => 3);

    final sync = FakeSyncService();
    when(() => sync.flush()).thenAnswer(
      (_) async => const SyncResult(
        sessions: 0,
        answers: 0,
        duplicated: 0,
        error: '网络超时了，请稍后重试',
      ),
    );

    await pumpScreen(
      tester,
      host(),
      overrides: <Object>[
        localPracticeStoreProvider.overrideWithValue(store),
        syncServiceProvider.overrideWithValue(sync),
      ],
    );
    await tester.pump();

    await tester.tap(find.text('立即同步'));
    await tester.pump();
    await tester.pump();

    expect(find.text('已同步，可以换机了'), findsNothing);
    expect(find.text('待同步 3 条'), findsOneWidget);
    expect(find.text('同步失败：网络超时了，请稍后重试'), findsOneWidget);
    expect(find.text('立即同步'), findsOneWidget, reason: '失败后还能重试');
  });

  testWidgets('flush 未报错但本地仍有剩余：同样按失败处理（宽限期内的新作答）', (tester) async {
    final store = FakeLocalPracticeStore();
    when(() => store.pendingCount()).thenAnswer((_) async => 2);

    final sync = FakeSyncService();
    when(() => sync.flush()).thenAnswer(
      (_) async => const SyncResult.empty(),
    );

    await pumpScreen(
      tester,
      host(),
      overrides: <Object>[
        localPracticeStoreProvider.overrideWithValue(store),
        syncServiceProvider.overrideWithValue(sync),
      ],
    );
    await tester.pump();

    await tester.tap(find.text('立即同步'));
    await tester.pump();
    await tester.pump();

    expect(find.text('已同步，可以换机了'), findsNothing);
    expect(find.text('待同步 2 条'), findsOneWidget);
    expect(find.textContaining('仍有 2 条待同步'), findsOneWidget);
  });
}
