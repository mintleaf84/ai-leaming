import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 设备连通性事件流（**可注入**）。
///
/// 单独拆一层 Provider 是为了测试：`connectivity_plus` 走平台通道，单测里拿不到
/// 真事件。测试 override 这个 Provider 换成 `StreamController` 就能模拟
/// 「断网 → 恢复」；也可以直接 override [isOnlineProvider] 给固定值。
final connectivityChangesProvider = Provider<Stream<List<ConnectivityResult>>>(
  (ref) => Connectivity().onConnectivityChanged,
);

/// 当前是否在线（审计 #20 方案 A：离线提示与入口禁用）。
///
/// 注意是 `AsyncValue<bool>`：首帧还没有事件时是 `loading`。界面统一用
/// `value ?? true` 读取——**拿不准就按在线处理**。反过来（拿不准就禁用）会让
/// 网络正常但事件流迟迟不来（或平台不实现该事件）的用户永远点不动入口，
/// 而「以为在线但实际断了」最坏只是走一遍失败提示。
final isOnlineProvider = StreamProvider<bool>((ref) {
  return ref
      .watch(connectivityChangesProvider)
      .map(hasNetworkConnection)
      // 同值事件不重复通知：界面只关心「在线/离线」这一位，Wi-Fi 换 4G 不该重建。
      .distinct();
});

/// 把平台返回的连通性列表压成一个布尔值。
///
/// - 只要有一个非 `none` 的传输就认为在线（多网卡时可能同时有 wifi + mobile）；
/// - **空列表按在线处理**：部分平台在启动瞬间会给出空列表，按离线处理会造成
///   一帧「入口全灰」，而它并不代表真的断网。
bool hasNetworkConnection(List<ConnectivityResult> results) {
  if (results.isEmpty) return true;
  return results.any((result) => result != ConnectivityResult.none);
}
