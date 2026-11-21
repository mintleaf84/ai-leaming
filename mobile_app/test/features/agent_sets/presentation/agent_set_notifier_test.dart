import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_notifier.dart';

/// 本地通知出口：渠道常量、送达判定、失败不抛。
///
/// 平台通道本身在单测里跑不了，但「插件抛错时按没送达返回」与「渠道名/ID 是
/// 契约」这两件事可以钉：前者决定去重游标要不要推进，后者决定用户在系统设置里
/// 看到的是不是「AI 题集」。
class _MockPlugin extends Mock implements FlutterLocalNotificationsPlugin {}

void main() {
  setUpAll(() {
    registerFallbackValue(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    registerFallbackValue(const NotificationDetails());
  });

  test('渠道常量与通知 id 固定（用户关通知靠渠道名认得出）', () {
    expect(LocalAgentSetNotifier.channelId, 'agent_sets');
    expect(LocalAgentSetNotifier.channelName, 'AI 题集');
    expect(LocalAgentSetNotifier.notificationId, greaterThan(0));
  });

  test('插件初始化抛错：吞掉并返回 false（游标不推进，下次还能再试）', () async {
    final plugin = _MockPlugin();
    when(
      () => plugin.initialize(settings: any(named: 'settings')),
    ).thenThrow(Exception('platform channel missing'));

    final notifier = LocalAgentSetNotifier(plugin: plugin);

    // 测试环境默认平台是 Android，所以这条分支会真的走到插件调用上。
    if (LocalAgentSetNotifier.supportsLocalNotifications) {
      expect(
        await notifier.showNewSets(title: 'AI 题集', body: '有 1 道新题'),
        isFalse,
      );
    }
  });

  test('初始化成功但拿不到 Android 实现：仍然发一条 show 并算送达', () async {
    final plugin = _MockPlugin();
    when(
      () => plugin.initialize(settings: any(named: 'settings')),
    ).thenAnswer((_) async => true);
    when(
      () => plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >(),
    ).thenReturn(null);
    when(
      () => plugin.show(
        id: any(named: 'id'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        notificationDetails: any(named: 'notificationDetails'),
      ),
    ).thenAnswer((_) async {});

    final notifier = LocalAgentSetNotifier(plugin: plugin);

    if (!LocalAgentSetNotifier.supportsLocalNotifications) {
      // iOS/macOS 上本期不启用（见类注释），直接确认「不发」。
      expect(
        await notifier.showNewSets(title: 'AI 题集', body: '有 1 道新题'),
        isFalse,
      );
      return;
    }

    expect(await notifier.showNewSets(title: 'AI 题集', body: '有 1 道新题'), isTrue);
    final shown = verify(
      () => plugin.show(
        id: any(named: 'id'),
        title: captureAny(named: 'title'),
        body: captureAny(named: 'body'),
        notificationDetails: captureAny(named: 'notificationDetails'),
      ),
    ).captured;
    expect(shown[0], 'AI 题集');
    expect(shown[1], '有 1 道新题');
    final details = shown[2] as NotificationDetails;
    expect(details.android?.channelId, LocalAgentSetNotifier.channelId);
    expect(details.android?.channelName, LocalAgentSetNotifier.channelName);
  });

  test('非 Android 平台：直接返回 false，不碰平台通道', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    final plugin = _MockPlugin();

    expect(
      await LocalAgentSetNotifier(
        plugin: plugin,
      ).showNewSets(title: 'AI 题集', body: 'body'),
      isFalse,
    );
    verifyNever(() => plugin.initialize(settings: any(named: 'settings')));
  });

  test('SilentAgentSetNotifier 恒为未送达（测试默认实现）', () async {
    expect(
      await const SilentAgentSetNotifier().showNewSets(title: 'x', body: 'y'),
      isFalse,
    );
  });
}
