import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

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
  dio.interceptors.add(AuthInterceptor());

  // Add logging interceptor
  dio.interceptors.add(LogInterceptor(requestBody: true, responseBody: true));

  return dio;
});

class AuthInterceptor extends Interceptor {
  final _storage = const FlutterSecureStorage();

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
}
