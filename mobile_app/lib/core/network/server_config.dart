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

    state = ServerConfigState(
      storedBaseUrl: normalized,
      effectiveBaseUrl: ApiConstants.resolveBaseUrl(runtimeBaseUrl: normalized),
    );
    return null;
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
