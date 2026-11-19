import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/auth_repository.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return AuthRepositoryImpl(ApiClient(dio), const FlutterSecureStorage());
});

class AuthRepositoryImpl implements AuthRepository {
  final ApiClient _apiClient;
  final FlutterSecureStorage _storage;

  AuthRepositoryImpl(this._apiClient, this._storage);

  @override
  Future<void> login(String username, String password) async {
    final response = await _apiClient.login({
      'username': username,
      'password': password,
    });
    final token = response['token'];
    // 先校验再落盘：token 为 null 时 `write(value: null)` 是删除而非写入，
    // 方法却会正常返回——界面跳进主界面，下一个请求立刻 401。
    if (token is! String || token.isEmpty) {
      throw const AuthException('登录响应缺少 token，请重试');
    }
    await _storage.write(key: 'jwt_token', value: token);
  }

  @override
  Future<void> register(String username, String password) async {
    final response = await _apiClient.register({
      'username': username,
      'password': password,
    });
    final token = response['token'];
    if (token is! String || token.isEmpty) {
      throw const AuthException('注册响应缺少 token，请重试');
    }
    await _storage.write(key: 'jwt_token', value: token);
  }

  @override
  Future<String?> getToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  @override
  Future<void> logout() async {
    await _storage.delete(key: 'jwt_token');
  }
}
