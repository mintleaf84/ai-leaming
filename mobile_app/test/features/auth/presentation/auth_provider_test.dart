import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_repository_impl.dart';
import 'package:mobile_app/features/auth/domain/auth_repository.dart';
import 'package:mobile_app/features/auth/presentation/auth_provider.dart';

/// 这个测试守的是登录/注册的**异步状态机**和**错误可见性**：
///
/// 1. **loading → data/error 三态齐全**：`login/register` 走 `AsyncValue.guard`，
///    成功必须回到 `AsyncData`（否则按钮永远转圈），失败必须是 `AsyncError`
///    且保留原始异常——登录失败的文案在界面层决定，provider 不能把它换成 null。
/// 2. **失败后能重试**：一次失败不该让 controller 停在不可用状态；再调一次
///    login 成功即可恢复 `AsyncData`，错误态被清掉。
/// 3. **登出清掉错误态**：登出后是干净的 `AsyncData(null)`，界面不会残留
///    上一次登录失败的提示。
/// 4. **登出失败只进 state**：`logout` 用 `AsyncValue.guard` 兜住仓库异常，
///    失败时状态是 `AsyncError` 且 `authEpoch` 不变（用户其实还在登录态，
///    清掉历史/对话等于让用户丢数据）；成功才 bump 版本号。
class FakeAuthRepository implements AuthRepository {
  final List<List<String>> loginCalls = [];
  final List<List<String>> registerCalls = [];
  int logoutCalls = 0;

  Object? loginError;
  Object? registerError;
  Object? logoutError;

  /// 非 null 时 login 挂在这里，用于观察 loading 中间态。
  Completer<void>? loginGate;

  @override
  Future<void> login(String username, String password) async {
    loginCalls.add([username, password]);
    final gate = loginGate;
    if (gate != null) await gate.future;
    final error = loginError;
    if (error != null) throw error;
  }

  @override
  Future<void> register(String username, String password) async {
    registerCalls.add([username, password]);
    final error = registerError;
    if (error != null) throw error;
  }

  @override
  Future<String?> getToken() async => null;

  @override
  Future<void> logout() async {
    logoutCalls++;
    final error = logoutError;
    if (error != null) throw error;
  }
}

void main() {
  late FakeAuthRepository repository;

  setUp(() {
    repository = FakeAuthRepository();
  });

  ProviderContainer makeContainer() {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [authRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('初始状态', () {
    test('初始是 AsyncData(null)：不转圈、无错误', () {
      final container = makeContainer();

      final state = container.read(authControllerProvider);

      expect(state, isA<AsyncData<void>>());
      expect(state.hasError, isFalse);
      expect(state.isLoading, isFalse);
    });
  });

  group('login', () {
    test('成功：凭据原样交给仓库，状态回到 AsyncData', () async {
      final container = makeContainer();

      await container
          .read(authControllerProvider.notifier)
          .login('cjb', 'pwd123');

      expect(repository.loginCalls.single, ['cjb', 'pwd123']);
      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncData<void>>());
      expect(state.hasError, isFalse);
    });

    test('请求进行中处于 loading', () async {
      repository.loginGate = Completer<void>();
      final container = makeContainer();

      final future = container
          .read(authControllerProvider.notifier)
          .login('cjb', 'pwd');
      await pumpEventQueue();
      expect(container.read(authControllerProvider).isLoading, isTrue);

      repository.loginGate!.complete();
      await future;
      expect(container.read(authControllerProvider).isLoading, isFalse);
    });

    test('失败：状态是 AsyncError 且保留原始异常（不吞成 null）', () async {
      repository.loginError = Exception('用户名或密码错误');
      final container = makeContainer();

      await container.read(authControllerProvider.notifier).login('cjb', 'bad');

      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncError<void>>());
      expect(state.isLoading, isFalse);
      expect(
        state.error.toString(),
        contains('用户名或密码错误'),
        reason: '界面要靠原始异常区分「密码错」和「网络断」',
      );
    });

    test('失败后重试成功，错误态被清掉', () async {
      repository.loginError = Exception('密码错');
      final container = makeContainer();
      final notifier = container.read(authControllerProvider.notifier);
      await notifier.login('cjb', 'bad');
      expect(container.read(authControllerProvider).hasError, isTrue);

      repository.loginError = null;
      await notifier.login('cjb', 'good');

      final state = container.read(authControllerProvider);
      expect(state.hasError, isFalse);
      expect(state, isA<AsyncData<void>>());
    });

    test('响应缺 token（AuthException）：状态是 AsyncError 且保留 AuthException', () async {
      repository.loginError = const AuthException('登录响应缺少 token，请重试');
      final container = makeContainer();

      await container.read(authControllerProvider.notifier).login('cjb', 'pwd');

      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncError<void>>());
      expect(state.error, isA<AuthException>());
      expect(state.error.toString(), contains('缺少 token'));
    });
  });

  group('register', () {
    test('成功：凭据原样交给仓库并回到 AsyncData', () async {
      final container = makeContainer();

      await container
          .read(authControllerProvider.notifier)
          .register('newbie', 'pwd');

      expect(repository.registerCalls.single, ['newbie', 'pwd']);
      expect(container.read(authControllerProvider), isA<AsyncData<void>>());
    });

    test('失败：AsyncError 且保留异常信息', () async {
      repository.registerError = Exception('用户名已存在');
      final container = makeContainer();

      await container
          .read(authControllerProvider.notifier)
          .register('dup', 'pwd');

      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncError<void>>());
      expect(state.error.toString(), contains('用户名已存在'));
    });
  });

  group('logout', () {
    test('成功：调用仓库并清掉之前的错误态', () async {
      repository.loginError = Exception('密码错');
      final container = makeContainer();
      final notifier = container.read(authControllerProvider.notifier);
      await notifier.login('cjb', 'bad');
      expect(container.read(authControllerProvider).hasError, isTrue);

      await notifier.logout();

      expect(repository.logoutCalls, 1);
      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncData<void>>());
      expect(state.hasError, isFalse, reason: '登出后不该还挂着上次登录失败的提示');
    });

    test('仓库抛异常：状态是 AsyncError，异常不再冒到调用方', () async {
      repository.logoutError = Exception('本地 token 删除失败');
      final container = makeContainer();
      final notifier = container.read(authControllerProvider.notifier);

      await notifier.logout();

      expect(repository.logoutCalls, 1);
      final state = container.read(authControllerProvider);
      expect(state, isA<AsyncError<void>>());
      expect(state.error.toString(), contains('本地 token 删除失败'));
    });
  });

  /// `authEpochProvider` 是 history / chat 判断「账号私有数据该清空」的唯一信号：
  /// `authControllerProvider` 的 state 是 `AsyncValue<void>`，登出写回的
  /// `AsyncData(null)` 与旧值相等，Riverpod 判等后不会通知依赖方。
  group('authEpoch（登出通知的唯一信号）', () {
    test('登录成功：版本号 +1', () async {
      final container = makeContainer();
      expect(container.read(authEpochProvider), 0);

      await container.read(authControllerProvider.notifier).login('cjb', 'pwd');

      expect(container.read(authEpochProvider), 1);
    });

    test('登录失败：版本号不变（失败不是登录态变化）', () async {
      repository.loginError = Exception('用户名或密码错误');
      final container = makeContainer();
      expect(container.read(authEpochProvider), 0);

      await container.read(authControllerProvider.notifier).login('cjb', 'bad');

      expect(container.read(authEpochProvider), 0);
    });

    test('登出：版本号 +1，重复登出继续 +1', () async {
      final container = makeContainer();
      final notifier = container.read(authControllerProvider.notifier);
      expect(container.read(authEpochProvider), 0);

      await notifier.logout();
      expect(
        container.read(authEpochProvider),
        1,
        reason: '从未登录过也要通知：幂等且无害',
      );

      await notifier.logout();
      expect(container.read(authEpochProvider), 2);
    });

    test('登出失败：版本号不变（还在登录态，不该清历史/对话）', () async {
      repository.logoutError = Exception('本地 token 删除失败');
      final container = makeContainer();
      final notifier = container.read(authControllerProvider.notifier);
      await notifier.login('cjb', 'pwd');
      expect(container.read(authEpochProvider), 1);

      await notifier.logout();

      expect(container.read(authControllerProvider).hasError, isTrue);
      expect(
        container.read(authEpochProvider),
        1,
        reason: '清理失败说明用户其实还在登录态，bump 会把历史/对话清空',
      );
    });
  });
}
