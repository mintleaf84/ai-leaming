import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/connectivity_provider.dart';

/// 在线/离线判定（审计 #20 方案 A）。
///
/// 守的线：
/// 1. **注入点可用**：`isOnlineProvider` 能被假流替换（生产走 connectivity_plus，
///    单测碰不到平台通道）；
/// 2. **归一化正确**：`[none]` 是离线，多网卡任一可用即在线，空列表按在线
///    （平台启动瞬间会给空列表，按离线处理会让入口闪一帧灰）；
/// 3. **能跟着事件变化**：断网 → 恢复必须触发界面重建，而不是只在首帧判一次。
void main() {
  group('hasNetworkConnection', () {
    test('[none] 是离线，任一真实传输即在线', () {
      expect(
        hasNetworkConnection(<ConnectivityResult>[ConnectivityResult.none]),
        isFalse,
      );
      expect(
        hasNetworkConnection(<ConnectivityResult>[ConnectivityResult.wifi]),
        isTrue,
      );
      expect(
        hasNetworkConnection(<ConnectivityResult>[
          ConnectivityResult.none,
          ConnectivityResult.mobile,
        ]),
        isTrue,
        reason: '多网卡时任一可用就算在线',
      );
    });

    test('空列表按在线处理（拿不准不要禁用入口）', () {
      expect(hasNetworkConnection(const <ConnectivityResult>[]), isTrue);
    });
  });

  group('isOnlineProvider', () {
    test('跟随注入的事件流切换在线状态', () async {
      final controller = StreamController<List<ConnectivityResult>>.broadcast();
      addTearDown(controller.close);

      final container = ProviderContainer(
        overrides: [
          connectivityChangesProvider.overrideWithValue(controller.stream),
        ],
      );
      addTearDown(container.dispose);

      // 首帧还没有事件：loading，界面按在线处理。
      expect(container.read(isOnlineProvider).value, isNull);
      // StreamProvider 的订阅在首次读取时建立；这里再挂一个监听，确保后续
      // 事件有地方落地（只 read 不 listen 时 Riverpod 会认为没人关心）。
      final subscription = container.listen(isOnlineProvider, (_, _) {});
      addTearDown(subscription.close);

      controller.add(<ConnectivityResult>[ConnectivityResult.wifi]);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(container.read(isOnlineProvider).value, isTrue);

      controller.add(<ConnectivityResult>[ConnectivityResult.none]);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(container.read(isOnlineProvider).value, isFalse);

      controller.add(<ConnectivityResult>[ConnectivityResult.mobile]);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(
        container.read(isOnlineProvider).value,
        isTrue,
        reason: '恢复网络后入口必须重新可用',
      );
    });
  });
}
