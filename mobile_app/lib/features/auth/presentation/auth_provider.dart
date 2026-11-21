import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_epoch.dart';
import '../data/auth_repository_impl.dart';

// `authEpochProvider` 住在 `core/auth/auth_epoch.dart`（跨 feature 的核心信号，
// 不该让 history/chat/practice 反向依赖 auth 的表现层）。这里 re-export，
// 老的 `import '.../auth_provider.dart'` 拿得到同一个 provider。
export '../../../core/auth/auth_epoch.dart';

final authControllerProvider = AsyncNotifierProvider<AuthController, void>(() {
  return AuthController();
});

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
    // 失败也要落进 state：界面据此判断「还在登录态、不要跳登录页」。
    state = await AsyncValue.guard(() => repo.logout());
    // 注意判 `hasError` 而不是 `hasValue`：Riverpod 3 的 AsyncError 会把上一次
    // 的 AsyncData 值合并进来（`AsyncError.hasValue == true`），用 hasValue
    // 判断会把失败当成功。
    if (!state.hasError) {
      state = const AsyncValue.data(null);
      // 登出必须通知：上面的 state 与旧值相等（AsyncData(null) == AsyncData(null)），
      // Riverpod 判等后不会通知监听者，账号私有数据只能靠这个版本号被清掉。
      // 失败时**不** bump：本地清理失败说明用户其实还在登录态，
      // 清掉历史/对话反而让用户丢掉数据。
      ref.read(authEpochProvider.notifier).bump();
    }
  }
}
