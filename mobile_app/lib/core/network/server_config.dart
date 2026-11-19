import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../constants/api_constants.dart';

/// 服务器地址的持久化通道。
///
/// 抽成接口而不是直接用 [FlutterSecureStorage]：单元测试注入内存假实现即可，
/// 不需要 mock 平台通道。
abstract class ServerBaseUrlStore {
  Future<String?> read();

  Future<void> write(String baseUrl);

  Future<void> clear();
}

/// 生产实现：沿用 App 既有的 flutter_secure_storage（JWT 也存这里，未引入新依赖）。
class SecureServerBaseUrlStore implements ServerBaseUrlStore {
  const SecureServerBaseUrlStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const String storageKey = 'server_base_url';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: storageKey);

  @override
  Future<void> write(String baseUrl) =>
      _storage.write(key: storageKey, value: baseUrl);

  @override
  Future<void> clear() => _storage.delete(key: storageKey);
}

final serverBaseUrlStoreProvider = Provider<ServerBaseUrlStore>(
  (ref) => const SecureServerBaseUrlStore(),
);

/// 与 auth 侧一致的 JWT 存储位置。
///
/// `features/auth/data/auth_repository_impl.dart` / `core/network/dio_client.dart`
/// 都是 `const FlutterSecureStorage()` + key `jwt_token`；const 构造是同一个
/// canonical 实例，这里沿用同一实例与同一键，不另造存储。
final authJwtStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

/// JWT 在安全存储里的键名（与 auth 侧保持一致）。
const String authJwtStorageKey = 'jwt_token';

/// 启动时读取持久化地址；main() 与单测共用这一份实现。
///
/// 读失败（安全存储不可用等）按「未配置」处理并留日志：App 仍能启动，用户可以在
/// 启动页重新填写，而不是白屏。
Future<String?> readInitialServerBaseUrl(ServerBaseUrlStore store) async {
  try {
    return await store.read();
  } catch (error) {
    debugPrint('[ServerConfig] 读取已保存的服务器地址失败: $error');
    return null;
  }
}

/// main() 在 runApp 之前读出的持久化地址（dioProvider 是同步构建的，地址必须先就绪）。
///
/// 默认 null 表示「没有运行时配置」，测试里 override 成任意值即可模拟启动状态。
final initialServerBaseUrlProvider = Provider<String?>((ref) => null);

class ServerConfigState {
  const ServerConfigState({
    this.storedBaseUrl,
    this.effectiveBaseUrl,
    this.isSaving = false,
    this.errorMessage,
  });

  /// 用户显式保存过的地址（未配置时为 null）。
  final String? storedBaseUrl;

  /// 三级回落后的实际生效地址；为 null 表示还没有任何可用后端。
  final String? effectiveBaseUrl;

  final bool isSaving;

  /// 最近一次保存失败的原因，由展示层读取；成功或被清空后为 null。
  final String? errorMessage;

  bool get isConfigured => effectiveBaseUrl != null;

  ServerConfigState copyWith({
    String? storedBaseUrl,
    String? effectiveBaseUrl,
    bool? isSaving,
    String? errorMessage,
    bool clearError = false,
  }) {
    return ServerConfigState(
      storedBaseUrl: storedBaseUrl ?? this.storedBaseUrl,
      effectiveBaseUrl: effectiveBaseUrl ?? this.effectiveBaseUrl,
      isSaving: isSaving ?? this.isSaving,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class ServerConfigNotifier extends Notifier<ServerConfigState> {
  @override
  ServerConfigState build() {
    final stored = ref.watch(initialServerBaseUrlProvider);
    return ServerConfigState(
      storedBaseUrl: stored,
      effectiveBaseUrl: ApiConstants.resolveBaseUrl(runtimeBaseUrl: stored),
    );
  }

  /// 保存服务器地址并立即生效。
  ///
  /// 返回 null 表示成功；返回可直接展示的中文文案表示失败（展示层读
  /// [ServerConfigState.errorMessage] 渲染，不依赖 toast）。
  Future<String?> save(String raw) async {
    if (!ApiConstants.isValidBaseUrl(raw)) {
      const message = '地址需以 http:// 或 https:// 开头，并包含主机名';
      state = state.copyWith(isSaving: false, errorMessage: message);
      return message;
    }

    final normalized = ApiConstants.normalizeBaseUrl(raw);
    state = state.copyWith(isSaving: true, clearError: true);
    try {
      await ref.read(serverBaseUrlStoreProvider).write(normalized);
    } catch (error) {
      // 安全存储写入失败（keystore 不可用等）：原地址保持不变，失败原因交展示层，
      // 不静默吞掉——用户必须知道这次没生效。
      debugPrint('[ServerConfig] 写入服务器地址失败: $error');
      const message = '保存失败，请重试（原地址保持不变）';
      state = state.copyWith(isSaving: false, errorMessage: message);
      return message;
    }

    final previousBaseUrl = state.effectiveBaseUrl;
    state = ServerConfigState(
      storedBaseUrl: normalized,
      effectiveBaseUrl: ApiConstants.resolveBaseUrl(runtimeBaseUrl: normalized),
    );

    // 换到另一个 origin（scheme+host+port）时，旧服务器的 JWT 在新服务器上要么
    // 无效、要么对应另一个用户；先清掉，让后续请求以未登录身份走正常流程，而不是
    // 把旧凭据发给新后端。只清 token，不动本地题库与待同步作答。
    if (previousBaseUrl != null &&
        !ApiConstants.isSameOrigin(previousBaseUrl, normalized)) {
      await _clearAuthToken();
    }
    return null;
  }

  /// 清除 auth 侧持久化的 JWT（同一个 flutter_secure_storage 与 `jwt_token` 键）。
  Future<void> _clearAuthToken() async {
    try {
      await ref.read(authJwtStorageProvider).delete(key: authJwtStorageKey);
    } catch (error) {
      // 清理失败不阻断换址：新后端会用 401 拒绝旧 token，AuthInterceptor 随即
      // 走登出流程，旧凭据不会长期留在请求头里。
      debugPrint('[ServerConfig] 清除旧服务器 JWT 失败: $error');
    }
  }

  /// 用户重新编辑输入框时清掉上一次的失败提示。
  void clearError() {
    if (state.errorMessage == null) {
      return;
    }
    state = state.copyWith(clearError: true);
  }
}

final serverConfigProvider =
    NotifierProvider<ServerConfigNotifier, ServerConfigState>(
      ServerConfigNotifier.new,
    );
