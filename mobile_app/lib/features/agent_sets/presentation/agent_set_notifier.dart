import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 「有新的 AI 题集」的提醒出口。
///
/// 抽成接口而不是在控制器里直接调插件：本地通知走平台通道，widget 测试里既
/// 起不了插件也没法断言「发了几条」，注入一个假实现就能把「只在未读变多时
/// 发一次」这条规则钉死。
abstract class AgentSetNotifier {
  /// 发一条「有新题」通知。返回是否真的送达（平台不支持 / 用户拒权时为 false）。
  ///
  /// 返回 bool 的理由：只有真的送出去才把「已通知到哪」的游标往前推；没送达
  /// 就保持原值，下次回前台还能再试一次（否则用户拒权一次后永远收不到）。
  Future<bool> showNewSets({required String title, required String body});
}

/// 什么都不做的实现（测试默认 / 非 Android 平台回落）。
class SilentAgentSetNotifier implements AgentSetNotifier {
  const SilentAgentSetNotifier();

  @override
  Future<bool> showNewSets({
    required String title,
    required String body,
  }) async => false;
}

/// Android 本地通知实现。
///
/// 平台限制（契约 §6）：**没有服务端推送通道**，本地通知只在 App 进程活着、
/// 且我们在启动/回前台时主动查一次未读的那一瞬间发出。不做 `workmanager`
/// 周期拉取，也不做 FCM/APNs。
///
/// iOS 本期**不启用**：`flutter_local_notifications` 在 iOS 上要配
/// `AppDelegate` 的 `UNUserNotificationCenter` 委托与权限文案（Info.plist），
/// 本 lane 没有 Xcode 可验证，写了也只是「看起来接上了」。所以 iOS 走
/// [supportsLocalNotifications] == false，由首页角标 + 列表未读点承担提示
/// （见回报中的阻塞说明）。
class LocalAgentSetNotifier implements AgentSetNotifier {
  LocalAgentSetNotifier({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  /// Android 通知渠道（系统设置里显示的名字，用户可单独关掉）。
  static const String channelId = 'agent_sets';
  static const String channelName = 'AI 题集';
  static const String channelDescription = '外部 Agent 推来新题时提醒一次';

  /// 固定通知 id：同一批题只占一条，新提醒覆盖旧的，不在通知栏堆一串。
  static const int notificationId = 4101;

  bool _ready = false;

  /// 是否支持本地通知。只在 Android 上为 true，理由见类注释。
  static bool get supportsLocalNotifications =>
      defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<bool> showNewSets({
    required String title,
    required String body,
  }) async {
    if (!supportsLocalNotifications) return false;
    try {
      await _ensureReady();
      await _plugin.show(
        id: notificationId,
        title: title,
        body: body,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            channelId,
            channelName,
            channelDescription: channelDescription,
            importance: Importance.defaultImportance,
            priority: Priority.defaultPriority,
          ),
        ),
      );
      return true;
    } catch (error) {
      // 通知失败不影响做题，也不能把用户卡在启动流程里：记日志后按「没送达」
      // 返回，下次回前台再试（这是「可忽略且打结构化日志」那一类 catch）。
      debugPrint('[AgentSets] 本地通知发送失败: $error');
      return false;
    }
  }

  Future<void> _ensureReady() async {
    if (_ready) return;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(settings: settings);
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        channelId,
        channelName,
        description: channelDescription,
      ),
    );
    // Android 13+ 需要运行时授权；拒绝也不阻断，只影响通知。
    await android?.requestNotificationsPermission();
    _ready = true;
  }
}

/// 通知出口的 Provider。
///
/// 测试里 override 成 [SilentAgentSetNotifier]（或记录用的假实现），
/// 生产走 [LocalAgentSetNotifier]。
final agentSetNotifierProvider = Provider<AgentSetNotifier>(
  (ref) => LocalAgentSetNotifier(),
);
