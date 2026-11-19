import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/auth_repository_impl.dart';

final authControllerProvider = AsyncNotifierProvider<AuthController, void>(() {
  return AuthController();
});

/// 登录态版本号：登录、注册、登出各 +1。
///
/// 为什么不直接 watch authControllerProvider：它的 state 是 `AsyncValue<void>`，
/// 登出写入的 `AsyncData(null)` 与旧值相等，Riverpod 判等后不会通知监听者。
/// 需要"登录态变了就清空账号私有数据"的地方（history / chat）watch 这个版本号。
final authEpochProvider = NotifierProvider<AuthEpoch, int>(AuthEpoch.new);

class AuthEpoch extends Notifier<int> {
  @override
  int build() => 0;

  /// 登录态发生实质变化（换账号/登出）时调用。
  void bump() => state = state + 1;
}

class AuthController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() {
    // Initial state
    return null;
  }

  Future<void> login(String username, String password) async {
    final repo = ref.read(authRepositoryProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => repo.login(username, password));
    // 只有真的登录成功才算登录态变化；失败时界面仍停在未登录，不该触发清理。
    if (state.hasValue && !state.hasError) {
      ref.read(authEpochProvider.notifier).bump();
    }
  }

  Future<void> register(String username, String password) async {
    final repo = ref.read(authRepositoryProvider);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => repo.register(username, password));
    if (state.hasValue && !state.hasError) {
      ref.read(authEpochProvider.notifier).bump();
    }
  }

  Future<void> logout() async {
    final repo = ref.read(authRepositoryProvider);
    await repo.logout();
    state = const AsyncValue.data(null);
    // 登出必须通知：上面的 state 与旧值相等（AsyncData(null) == AsyncData(null)），
    // Riverpod 判等后不会通知监听者，账号私有数据只能靠这个版本号被清掉。
    ref.read(authEpochProvider.notifier).bump();
  }
}
