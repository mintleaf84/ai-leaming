import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../app_router.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();

  dio.options.baseUrl = ApiConstants.baseUrl;
  dio.options.connectTimeout = const Duration(
    milliseconds: ApiConstants.connectTimeout,
  );
  dio.options.receiveTimeout = const Duration(
    milliseconds: ApiConstants.receiveTimeout,
  );
  dio.options.headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add auth interceptor
  dio.interceptors.add(AuthInterceptor(ref));

  // Add logging interceptor
  dio.interceptors.add(LogInterceptor(requestBody: true, responseBody: true));

  return dio;
});

class AuthInterceptor extends Interceptor {
  final Ref ref;
  final _storage = const FlutterSecureStorage();

  AuthInterceptor(this.ref);

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: 'jwt_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // 拦截 401 未授权 / 登录过期错误
    if (err.response?.statusCode == 401) {
      final token = await _storage.read(key: 'jwt_token');
      if (token != null) {
        // 清除本地异常无效的 Token
        await ref.read(authControllerProvider.notifier).logout();
        // 强制重定向回登录页
        appRouter.go('/login');
      }
    }
    handler.next(err);
  }
}
