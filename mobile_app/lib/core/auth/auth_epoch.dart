import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 登录态版本号：登录、注册、登出各 +1。
///
/// 为什么不直接 watch `authControllerProvider`：它的 state 是 `AsyncValue<void>`，
/// 登出写入的 `AsyncData(null)` 与旧值相等，Riverpod 判等后不会通知监听者。
/// 需要「登录态变了就清空账号私有数据」的地方（history / chat / practice 断点）
/// watch 这个版本号。
///
/// 放在 `core/auth/` 而不是 `features/auth/presentation/`：它是**跨 feature 的
/// 核心信号**，住进 auth feature 会让 history/chat/practice 反向依赖 auth 的
/// 表现层，也让 `core/` 依赖 `features/`。写入口仍然只有 [AuthController]
/// （`features/auth/presentation/auth_provider.dart`，那里 re-export 本文件，
/// 老的 import 路径继续可用）。
final authEpochProvider = NotifierProvider<AuthEpoch, int>(AuthEpoch.new);

class AuthEpoch extends Notifier<int> {
  @override
  int build() => 0;

  /// 登录态发生实质变化（换账号/登出）时调用。
  void bump() => state = state + 1;
}
