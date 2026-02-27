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
    await _storage.write(key: 'jwt_token', value: token);
  }

  @override
  Future<void> register(String username, String password) async {
    final response = await _apiClient.register({
      'username': username,
      'password': password,
    });
    final token = response['token'];
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
