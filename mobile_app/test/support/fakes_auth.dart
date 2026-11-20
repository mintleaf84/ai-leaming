import 'dart:async';
import 'dart:convert';

import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/auth/data/auth_repository_impl.dart';
import 'package:mobile_app/features/auth/domain/auth_repository.dart';

import 'fake_preferences_store.dart';

/// 认证仓库替身：给登录 / 注册 / 启动三个屏共用。
///
/// 为什么单独一个文件而不是塞进 `fake_providers.dart`：那个文件是多个 lane
/// 并行改的共享装配表，认证这批只需要四个方法，独立放一个文件能避免改到
/// 别人的装配顺序（也避免别人改它时连带打断这三个屏的测试）。
///
/// 设计口径与 `fake_providers.dart` 一致：**能跑真控制器就造假仓库**。
/// 屏测试里 `AuthController` 是真跑的，所以「提交中转圈」「失败停在原页」
/// 这些状态是控制器 + `AsyncValue.guard` 真跑出来的，不是测试自己塞的 state。
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({
    this.token,
    this.loginError,
    this.registerError,
    this.getTokenError,
    this.logoutError,
  });

  /// `getToken()` 的返回值（启动屏据此决定落点）。
  String? token;

  Object? loginError;
  Object? registerError;

  /// 非 null 时 `getToken()` 直接抛（验证启动屏的 catch 兜底）。
  Object? getTokenError;
  Object? logoutError;

  /// 挂住 `login` / `register`：用来观察「提交中」的中间态。
  Completer<void>? loginGate;
  Completer<void>? registerGate;

  int loginCalls = 0;
  int registerCalls = 0;
  int getTokenCalls = 0;
  int logoutCalls = 0;

  /// 每次登录/注册带上来的凭据，顺序即调用顺序。
  final List<List<String>> loginArgs = <List<String>>[];
  final List<List<String>> registerArgs = <List<String>>[];

  @override
  Future<void> login(String username, String password) async {
    loginCalls++;
    loginArgs.add(<String>[username, password]);
    final gate = loginGate;
    if (gate != null) await gate.future;
    final error = loginError;
    if (error != null) throw error;
    // 真实现会把 token 落盘，屏测试只需要「之后启动屏能读到」的场景，这里
    // 交回给测试自己写 token，避免假仓库偷偷改变 getToken 的行为。
  }

  @override
  Future<void> register(String username, String password) async {
    registerCalls++;
    registerArgs.add(<String>[username, password]);
    final gate = registerGate;
    if (gate != null) await gate.future;
    final error = registerError;
    if (error != null) throw error;
  }

  @override
  Future<String?> getToken() async {
    getTokenCalls++;
    final error = getTokenError;
    if (error != null) throw error;
    return token;
  }

  @override
  Future<void> logout() async {
    logoutCalls++;
    final error = logoutError;
    if (error != null) throw error;
    // 过期 token 被清掉之后，再读必须是 null（真实现的语义）。
    token = null;
  }
}

/// 认证四屏的 provider 装配：假仓库 + 内存键值存储。
///
/// 键值存储必须一起换掉：登录/注册成功会清「未完成练习」断点
/// （`AuthController._clearAccountPrivatePracticeData`），真实现走
/// `shared_preferences` 平台通道，测试里会抛 MissingPluginException。
List<Object> fakeAuth({
  FakeAuthRepository? repository,
  String? token,
  Object? loginError,
  Object? registerError,
  Object? getTokenError,
}) {
  final repo =
      repository ??
      FakeAuthRepository(
        token: token,
        loginError: loginError,
        registerError: registerError,
        getTokenError: getTokenError,
      );
  return <Object>[
    authRepositoryProvider.overrideWithValue(repo),
    preferencesStoreProvider.overrideWithValue(FakePreferencesStore()),
  ];
}

/// 拼一个 `exp` 可控的 JWT（启动屏的「过期 token」分支要它）。
///
/// 不复用 `fake_providers.dart` 的 `fakeJwt()`：那个函数把 `exp` 写死成
/// 9999999999（永不过期），而启动屏要验的正是「exp 已过 → 去登录页并清残留」。
/// 载荷形状与它保持一致（`{user: {id, username}, exp}`），否则 `TokenUtil`
/// 解析路径就变成了另一条。
String fakeJwtWithExp({required int exp, int userId = 1}) {
  String segment(Object value) {
    return base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  }

  final header = segment(<String, dynamic>{'alg': 'HS256', 'typ': 'JWT'});
  final payload = segment(<String, dynamic>{
    'user': <String, dynamic>{'id': userId, 'username': 'tester'},
    'exp': exp,
  });
  return '$header.$payload.signature-not-verified';
}

/// 已过期的 token：`exp` 落在 1 小时前，越过 `TokenUtil` 的 60s leeway。
String expiredJwt({int userId = 1}) {
  final exp =
      DateTime.now()
          .subtract(const Duration(hours: 1))
          .millisecondsSinceEpoch ~/
      1000;
  return fakeJwtWithExp(exp: exp, userId: userId);
}
