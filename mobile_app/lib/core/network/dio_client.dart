import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';
import 'server_config.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../app_router.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();

  // 地址来自三级回落（运行时设置 > 编译期 dart-define > 未配置）。
  // 未配置时 baseUrl 留空：上层用 ServerConfigGate 挡住界面，不发请求。
  final baseUrl = ref.watch(serverConfigProvider).effectiveBaseUrl;
  if (baseUrl != null) {
    dio.options.baseUrl = baseUrl;
  }
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
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    _storage
        .read(key: 'jwt_token')
        .then((token) {
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        })
        .catchError((_) {
          // token 读取失败仍继续发出请求（无 token）
          handler.next(options);
        });
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      _storage
          .read(key: 'jwt_token')
          .then((token) {
            if (token != null) {
              ref.read(authControllerProvider.notifier).logout().then((_) {
                appRouter.go('/login');
              });
            }
            handler.next(err);
          })
          .catchError((_) {
            handler.next(err);
          });
    } else {
      handler.next(err);
    }
  }
}
