import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/fenbi/domain/fenbi_status.dart';
import 'package:mobile_app/features/fenbi/presentation/fenbi_providers.dart';

import '../../support/recording_adapter.dart'
    show RecordingAdapter, jsonBody, offlineException;

/// 粉笔同步 controller 的行为测试（真控制器 + 真 FenbiApi，只桩掉网络层）。
///
/// 守的四条线：
/// 1. **状态机**：load 失败要落到 error；已经有数据时刷新失败只记原因、不把
///    已上屏的绑定信息抹掉；
/// 2. **成功后的界面真相**：link/unlink 之后必须以服务端最新状态为准；
///    状态刷新失败时也不能反向把「已绑定」显示成「未绑定」（或反之）；
/// 3. **busy 防连点**：动作未完成时第二次点击直接拒绝——否则会连打粉笔接口
///    （登录失败一次就可能触发风控）；
/// 4. **扫码轮询**：2s 一次、单次失败不终止、连续 3 次才报错、confirmed 后停表、
///    3 分钟兜底过期。定时器用 widget 测试的假时钟推进，不真实等待。
void main() {
  late RecordingAdapter adapter;
  late ProviderContainer container;

  ProviderContainer newContainer() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    final created = ProviderContainer(
      retry: (_, _) => null,
      overrides: [dioProvider.overrideWithValue(dio)],
    );
    addTearDown(created.dispose);
    return created;
  }

  Map<String, dynamic> statusJson({bool linked = true}) => <String, dynamic>{
    'linked': linked,
    'phoneMasked': linked ? '138****1234' : null,
    'fenbiUserId': linked ? 'fb-9' : null,
    'lastResult': linked
        ? <String, dynamic>{
            'imported': 1,
            'skipped': 0,
            'newQuestions': 2,
            'failed': <Object?>[],
          }
        : null,
    'syncable': linked,
    'unsupported': <String>['paper'],
  };

  FenbiSyncController controller() =>
      container.read(fenbiSyncControllerProvider.notifier);

  FenbiSyncState syncState() => container.read(fenbiSyncControllerProvider);

  /// `fenbiSyncControllerProvider` 是 autoDispose：测试里挂一个监听，
  /// 免得两次 read 之间被回收（真实界面由 `ref.watch` 持活）。
  void keepSyncAlive() {
    final sub = container.listen(fenbiSyncControllerProvider, (_, _) {});
    addTearDown(sub.close);
  }

  setUp(() {
    adapter = RecordingAdapter();
  });

  group('load', () {
    test('成功：phase=ready，解析出掩码手机号与上次结果', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(statusJson());

      await controller().load();

      expect(adapter.gets.single.path, '/fenbi/status');
      expect(syncState().phase, FenbiSyncPhase.ready);
      expect(syncState().linked, isTrue);
      expect(syncState().status!.phoneMasked, '138****1234');
      expect(syncState().errorMessage, isNull);
    });

    test('首屏失败：phase=error + 可读文案', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (options) => offlineException(options);

      await controller().load();

      expect(syncState().phase, FenbiSyncPhase.error);
      expect(syncState().linked, isFalse);
      expect(syncState().errorMessage, '网络好像断了，请检查网络后重试');
    });

    test('已有数据时刷新失败：保留旧状态，只记原因', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(statusJson());
      await controller().load();

      adapter.handler = (options) => offlineException(options);
      await controller().load();

      expect(syncState().phase, FenbiSyncPhase.ready);
      expect(syncState().linked, isTrue);
      expect(syncState().status!.phoneMasked, '138****1234');
      expect(syncState().errorMessage, isNotNull);
    });
  });

  group('link', () {
    test('成功：POST 后以服务端状态为准，busy 归位', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (options) {
        if (options.path == '/fenbi/link') {
          return jsonBody(<String, dynamic>{'ok': true});
        }
        return jsonBody(statusJson());
      };

      final outcome = await controller().link(
        phone: '13812341234',
        password: 'pw',
      );

      expect(outcome.isOk, isTrue);
      expect(adapter.posts.single.path, '/fenbi/link');
      expect(syncState().phase, FenbiSyncPhase.ready);
      expect(syncState().linked, isTrue);
      expect(syncState().busy, isFalse);
    });

    test('失败：返回后端文案，busy 归位，仍是未绑定', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'error': '账号或密码错误',
      }, statusCode: 400);

      final outcome = await controller().link(
        phone: '13812341234',
        password: 'pw',
      );

      expect(outcome.isOk, isFalse);
      expect(outcome.error, '账号或密码错误');
      expect(syncState().busy, isFalse);
      expect(syncState().linked, isFalse);
    });

    test('绑定成功但状态刷新失败：按「已绑定」显示，不骗用户再绑一次', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (options) {
        if (options.path == '/fenbi/link') {
          return jsonBody(<String, dynamic>{'ok': true});
        }
        return offlineException(options);
      };

      final outcome = await controller().link(
        phone: '13812341234',
        password: 'pw',
      );

      expect(outcome.isOk, isTrue);
      expect(syncState().linked, isTrue);
      expect(syncState().busy, isFalse);
    });

    test('busy 防连点：上一次没回来时第二次直接拒绝', () async {
      container = newContainer();
      keepSyncAlive();
      final gate = Completer<ResponseBody>();
      adapter.handler = (options) {
        if (options.path == '/fenbi/link') return gate.future;
        return jsonBody(statusJson());
      };

      final first = controller().link(phone: '13812341234', password: 'pw');
      await Future<void>.delayed(Duration.zero);
      final second = await controller().link(
        phone: '13812341234',
        password: 'pw',
      );

      expect(second.isOk, isFalse);
      expect(second.error, contains('上一个操作还没完成'));
      expect(syncState().busy, isTrue);

      gate.complete(jsonBody(<String, dynamic>{'ok': true}));
      expect((await first).isOk, isTrue);
      expect(syncState().busy, isFalse);
    });
  });

  group('sync', () {
    test('成功：返回并上屏本次结果，同时刷新上次同步状态', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (options) {
        if (options.path == '/fenbi/sync') {
          return jsonBody(<String, dynamic>{
            'imported': 2,
            'skipped': 1,
            'newQuestions': 3,
            'failed': <Object?>[],
          });
        }
        return jsonBody(statusJson());
      };
      await controller().load();

      final outcome = await controller().sync();

      expect(outcome.isOk, isTrue);
      expect(outcome.result!.imported, 2);
      expect(adapter.posts.single.path, '/fenbi/sync');
      expect(adapter.posts.single.data, <String, dynamic>{'full': false});
      expect(syncState().lastSyncResult!.skipped, 1);
      expect(syncState().displayResult!.newQuestions, 3);
      expect(syncState().busy, isFalse);
    });

    test('同步成功但状态刷新失败：仍算成功，保留旧状态', () async {
      container = newContainer();
      keepSyncAlive();
      var failStatus = false;
      adapter.handler = (options) {
        if (options.path == '/fenbi/sync') {
          return jsonBody(<String, dynamic>{'imported': 5});
        }
        if (failStatus) return offlineException(options);
        return jsonBody(statusJson());
      };
      await controller().load();

      failStatus = true;
      final outcome = await controller().sync();

      expect(outcome.isOk, isTrue);
      expect(syncState().status!.linked, isTrue);
      expect(syncState().lastSyncResult!.imported, 5);
      expect(syncState().busy, isFalse);
    });

    test('失败（服务端限频）：返回可读文案，busy 归位', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'error': '操作太频繁了，请等一分钟再试。',
      }, statusCode: 429);

      final outcome = await controller().sync();

      expect(outcome.isOk, isFalse);
      expect(outcome.error, '操作太频繁了，请等一分钟再试。');
      expect(syncState().busy, isFalse);
    });

    test('busy 防连点：同步中再点一次不重复请求', () async {
      container = newContainer();
      keepSyncAlive();
      final gate = Completer<ResponseBody>();
      adapter.handler = (options) {
        if (options.path == '/fenbi/sync') return gate.future;
        return jsonBody(statusJson());
      };

      final first = controller().sync();
      await Future<void>.delayed(Duration.zero);
      final second = await controller().sync();

      expect(second.isOk, isFalse);
      expect(second.error, contains('正在同步'));
      expect(adapter.posts.where((r) => r.path == '/fenbi/sync'), hasLength(1));

      gate.complete(jsonBody(<String, dynamic>{'imported': 1}));
      expect((await first).isOk, isTrue);
      expect(syncState().busy, isFalse);
    });
  });

  group('unlink', () {
    test('成功：DELETE /fenbi/link，状态回到未绑定', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(statusJson());
      await controller().load();

      adapter.handler = (options) {
        if (options.method == 'DELETE') {
          return jsonBody(<String, dynamic>{'ok': true});
        }
        return jsonBody(statusJson(linked: false));
      };
      final outcome = await controller().unlink();

      expect(outcome.isOk, isTrue);
      expect(adapter.deletes.single.path, '/fenbi/link');
      expect(syncState().linked, isFalse);
      expect(syncState().busy, isFalse);
    });

    test('解绑成功但状态刷新失败：按「未绑定」处理（不能继续显示已绑定）', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (options) {
        if (options.method == 'DELETE') {
          return jsonBody(<String, dynamic>{'ok': true});
        }
        return offlineException(options);
      };

      final outcome = await controller().unlink();

      expect(outcome.isOk, isTrue);
      expect(syncState().phase, FenbiSyncPhase.ready);
      expect(syncState().linked, isFalse);
      expect(syncState().busy, isFalse);
    });

    test('失败：返回可读文案，busy 归位', () async {
      container = newContainer();
      keepSyncAlive();
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'error': '解绑失败，请稍后重试',
      }, statusCode: 400);

      final outcome = await controller().unlink();

      expect(outcome.isOk, isFalse);
      expect(outcome.error, '解绑失败，请稍后重试');
      expect(syncState().busy, isFalse);
    });

    test('busy 防连点：解绑中再点一次直接拒绝', () async {
      container = newContainer();
      keepSyncAlive();
      final gate = Completer<ResponseBody>();
      adapter.handler = (options) {
        if (options.method == 'DELETE') return gate.future;
        return jsonBody(statusJson(linked: false));
      };

      final first = controller().unlink();
      await Future<void>.delayed(Duration.zero);
      final second = await controller().unlink();

      expect(second.isOk, isFalse);
      expect(second.error, contains('上一个操作还没完成'));
      expect(adapter.deletes, hasLength(1));

      gate.complete(jsonBody(<String, dynamic>{'ok': true}));
      expect((await first).isOk, isTrue);
      expect(syncState().busy, isFalse);
    });
  });

  group('扫码轮询（假时钟）', () {
    // 扫码弹层关掉后 provider 会 autoDispose；测试里手动 close + dispose，
    // 让 `ref.onDispose` 里的定时器取消跑在测试收尾之前。
    FenbiQrScanState qrState() => container.read(fenbiQrControllerProvider);

    Future<void> startQr(WidgetTester tester) async {
      final starting = container
          .read(fenbiQrControllerProvider.notifier)
          .start();
      await tester.pump();
      await starting;
    }

    testWidgets('pending → scanned → confirmed：每 2s 一次，确认后停表', (tester) async {
      container = newContainer();
      var status = 'pending';
      adapter.handler = (options) {
        if (options.path == '/fenbi/qrcode') {
          return jsonBody(<String, dynamic>{
            'lgtoken': 'lt-1',
            'qrContent': 'https://www.fenbi.com/scan?lgtoken=lt-1',
          });
        }
        return jsonBody(<String, dynamic>{'status': status});
      };
      final qrSub = container.listen(fenbiQrControllerProvider, (_, _) {});

      await startQr(tester);

      expect(qrState().hasSession, isTrue);
      expect(qrState().session!.lgtoken, 'lt-1');
      expect(adapter.posts.single.path, '/fenbi/qrcode');

      // 第一次轮询：pending
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().phase, FenbiQrPhase.pending);
      expect(adapter.gets.single.queryParameters, <String, dynamic>{
        'lgtoken': 'lt-1',
      });

      status = 'scanned';
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().phase, FenbiQrPhase.scanned);

      status = 'confirmed';
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().phase, FenbiQrPhase.confirmed);

      // 终态之后不再打接口（停表）
      final requests = adapter.requests.length;
      await tester.pump(const Duration(seconds: 8));
      expect(adapter.requests.length, requests);

      qrSub.close();
      container.dispose();
    });

    testWidgets('二维码不可用 / 生成失败：都落到可重试错误态，cancel 清空', (
      tester,
    ) async {
      container = newContainer();
      final qrSub = container.listen(fenbiQrControllerProvider, (_, _) {});
      final qr = container.read(fenbiQrControllerProvider.notifier);

      // 缺 qrContent：服务端契约漂移，不能让界面渲染一个空二维码
      adapter.handler = (_) => jsonBody(<String, dynamic>{'lgtoken': 'lt-1'});
      await startQr(tester);
      expect(qrState().session, isNull);
      expect(qrState().errorMessage, contains('没有返回可用的二维码'));

      // 生成失败：用后端文案
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'error': '粉笔风控已触发',
      }, statusCode: 400);
      await startQr(tester);
      expect(qrState().errorMessage, '粉笔风控已触发');

      qr.cancel();
      expect(qrState().session, isNull);
      expect(qrState().errorMessage, isNull);

      qrSub.close();
      container.dispose();
    });

    testWidgets('单次轮询失败不终止，连续 3 次失败才报错停表', (tester) async {
      container = newContainer();
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'lgtoken': 'lt-1',
        'qrContent': 'https://www.fenbi.com/scan?lgtoken=lt-1',
      });
      final qrSub = container.listen(fenbiQrControllerProvider, (_, _) {});
      await startQr(tester);

      adapter.handler = (options) => offlineException(options);
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().errorMessage, isNull, reason: '一次抖动不该打断扫码');

      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().errorMessage, isNull);

      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(qrState().errorMessage, '网络好像断了，请检查网络后重试');

      // 停表后不再请求
      final requests = adapter.requests.length;
      await tester.pump(const Duration(seconds: 6));
      expect(adapter.requests.length, requests);

      qrSub.close();
      container.dispose();
    });

    testWidgets('上一次轮询还没回来时不叠加请求', (tester) async {
      container = newContainer();
      adapter.handler = (_) => jsonBody(<String, dynamic>{
        'lgtoken': 'lt-1',
        'qrContent': 'https://www.fenbi.com/scan?lgtoken=lt-1',
      });
      final qrSub = container.listen(fenbiQrControllerProvider, (_, _) {});
      await startQr(tester);

      final gate = Completer<ResponseBody>();
      adapter.handler = (options) {
        if (options.path == '/fenbi/qrcode/status') return gate.future;
        return jsonBody(<String, dynamic>{});
      };
      await tester.pump(const Duration(seconds: 2)); // 第 1 次轮询挂起
      await tester.pump(const Duration(seconds: 2)); // 第 2 次定时器触发 → 跳过

      expect(adapter.gets, hasLength(1), reason: 'in-flight 时不叠加请求');

      gate.complete(jsonBody(<String, dynamic>{'status': 'pending'}));
      await tester.pump();
      await tester.pump();
      expect(qrState().phase, FenbiQrPhase.pending);

      qrSub.close();
      container.dispose();
    });

    testWidgets('一直在等扫码：3 分钟（90 次轮询）后本地兜底为过期', (tester) async {
      container = newContainer();
      adapter.handler = (options) {
        if (options.path == '/fenbi/qrcode') {
          return jsonBody(<String, dynamic>{
            'lgtoken': 'lt-1',
            'qrContent': 'https://www.fenbi.com/scan?lgtoken=lt-1',
          });
        }
        return jsonBody(<String, dynamic>{'status': 'pending'});
      };
      final qrSub = container.listen(fenbiQrControllerProvider, (_, _) {});
      await startQr(tester);

      for (var i = 0; i < FenbiQrController.maxPolls; i++) {
        await tester.pump(const Duration(seconds: 2));
        await tester.pump();
      }

      expect(qrState().phase, FenbiQrPhase.expired);

      qrSub.close();
      container.dispose();
    });
  });
}
