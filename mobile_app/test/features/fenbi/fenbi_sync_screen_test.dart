import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/fenbi/data/fenbi_api.dart';
import 'package:mobile_app/features/fenbi/domain/fenbi_status.dart';
import 'package:mobile_app/features/fenbi/presentation/fenbi_providers.dart';
import 'package:mobile_app/features/fenbi/presentation/fenbi_sync_screen.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

import '../../support/pump_screen.dart';

/// 粉笔同步屏冒烟：三种形态（未绑定 / 已绑定 / 动作失败）都只钉
/// 「用户能不能看懂、能不能再试」，不测像素。
class _FakeFenbiApi extends FenbiApi {
  _FakeFenbiApi({this.status = const FenbiSyncStatus(), this.syncError})
    : super(Dio());

  FenbiSyncStatus status;

  /// 非空时 `sync` 抛 [FenbiApiException]（模拟服务端 `{ error }` / 风控）。
  String? syncError;

  FenbiSyncResult? syncResult;
  int syncCalls = 0;

  @override
  Future<FenbiSyncStatus> fetchStatus() async => status;

  @override
  Future<FenbiSyncResult> sync({bool full = false}) async {
    syncCalls++;
    final error = syncError;
    if (error != null) throw FenbiApiException(error);
    final result =
        syncResult ?? const FenbiSyncResult(imported: 2, skipped: 1);
    status = status.copyWith(lastResult: result);
    return result;
  }

  @override
  Future<void> unlink() async {
    status = const FenbiSyncStatus();
  }

  @override
  Future<FenbiQrSession> createQrSession() async {
    return const FenbiQrSession(
      lgtoken: 'lgtoken-test',
      qrContent: 'https://www.fenbi.com/scan?lgtoken=lgtoken-test',
      qrPngDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
  }

  @override
  Future<FenbiQrPhase> fetchQrPhase(String lgtoken) async {
    return FenbiQrPhase.pending;
  }

  @override
  Future<void> link({required String phone, required String password}) async {}
}

const _boundStatus = FenbiSyncStatus(
  linked: true,
  phoneMasked: '138****1234',
  lastResult: FenbiSyncResult(imported: 3, skipped: 0, newQuestions: 5),
);

void main() {
  Future<void> pumpFenbi(WidgetTester tester, _FakeFenbiApi api) async {
    await pumpScreen(
      tester,
      const FenbiSyncScreen(),
      overrides: <Object>[fenbiApiProvider.overrideWithValue(api)],
    );
    // initState 里的 load() 是 microtask：再推一帧进到 ready 态。
    await tester.pump();
  }

  testWidgets('未绑定：两个绑定入口 + 接口限制说明', (tester) async {
    await pumpFenbi(tester, _FakeFenbiApi());

    expect(find.text('还没有绑定粉笔账号'), findsOneWidget);
    expect(find.text('扫码绑定'), findsOneWidget);
    expect(find.text('用密码绑定'), findsOneWidget);
    expect(find.textContaining('试卷/模考记录暂不支持'), findsOneWidget);
  });

  testWidgets('已绑定：掩码手机号、上次结果、同步/解绑入口', (tester) async {
    await pumpFenbi(tester, _FakeFenbiApi(status: _boundStatus));

    expect(find.text('138****1234'), findsOneWidget);
    expect(find.text('已绑定'), findsOneWidget);
    expect(find.textContaining('导入 3'), findsWidgets);
    expect(find.text('立即同步'), findsOneWidget);
    expect(find.text('解绑'), findsOneWidget);
    // 已绑定态也要看到限制说明，不能只在绑定前说一次
    expect(find.textContaining('试卷/模考记录暂不支持'), findsOneWidget);
  });

  testWidgets('同步失败：整屏错误视图可重试，重试成功后回到结果', (tester) async {
    final api = _FakeFenbiApi(
      status: _boundStatus,
      syncError: '粉笔临时限制了这次登录，请稍后用扫码绑定，或换网络再试。',
    );
    await pumpFenbi(tester, api);

    await tester.tap(find.text('立即同步'));
    await tester.pump();
    await tester.pump();

    expect(find.byType(AppErrorView), findsOneWidget);
    expect(find.text('同步失败'), findsOneWidget);
    expect(api.syncCalls, 1);

    // 服务端恢复后点「重试」：错误视图消失、结果刷新成新数据
    api.syncError = null;
    api.syncResult = const FenbiSyncResult(imported: 4, skipped: 2);
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();

    expect(find.byType(AppErrorView), findsNothing);
    expect(find.textContaining('导入 4'), findsWidgets);
    expect(api.syncCalls, 2);
  });

  testWidgets('解绑要二次确认：取消后仍是已绑定', (tester) async {
    await pumpFenbi(tester, _FakeFenbiApi(status: _boundStatus));

    await tester.tap(find.text('解绑'));
    await tester.pump();
    await tester.pump();

    expect(find.text('解绑粉笔账号？'), findsOneWidget);
    expect(find.textContaining('已经同步进来的练习记录会保留'), findsOneWidget);

    await tester.tap(find.text('取消'));
    await tester.pump();
    await tester.pump();

    expect(find.text('解绑粉笔账号？'), findsNothing);
    expect(find.text('138****1234'), findsOneWidget);
  });
}
