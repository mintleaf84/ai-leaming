/// 认证流程的可见错误：消息直接面向用户，由登录页 SnackBar 展示。
class AuthException implements Exception {
  const AuthException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract class AuthRepository {
  Future<void> login(String username, String password);
  Future<void> register(String username, String password);
  Future<String?> getToken();
  Future<void> logout();
}
