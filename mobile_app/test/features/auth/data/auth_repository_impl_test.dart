import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_repository_impl.dart';
import 'package:mobile_app/shared/datasources/api_client.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是登录/注册的三条线：
///
/// 1. **路径与载荷**：`POST /auth/login`、`POST /auth/register`，载荷键是
///    `username` / `password`（`Dio.baseUrl` 已含 `/api`，多写一层就是 404）。
/// 2. **成功后 token 真的落盘**：从响应里取 `token` 写进 `jwt_token`。
///    写错 key 或忘记 await，界面会「登录成功但下一个请求 401」。
/// 3. **失败时不得写入 token**：服务端 401 时异常要往上抛，且存储里不能留下
///    半截凭据——否则用户会带着一个假 token 进主界面，所有请求一起失败。
///
/// 存储用 `FlutterSecureStorage.setMockInitialValues` 换成内存实现，
/// 断言的是「客户端写/删了什么」，不是平台通道。
void main() {
  late RecordingAdapter adapter;
  late FlutterSecureStorage storage;
  late AuthRepositoryImpl repository;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    storage = const FlutterSecureStorage();
    repository = AuthRepositoryImpl(ApiClient(dio), storage);
  });

  group('login', () {
    test('POST /auth/login，载荷是 username/password，成功后 token 落盘', () async {
      adapter.responseBody = <String, dynamic>{
        'token': 'jwt-from-server',
        'user': <String, dynamic>{'id': 7, 'username': 'alice'},
      };

      await repository.login('alice', 's3cret');

      final request = adapter.requests.single;
      expect(request.path, '/auth/login');
      expect(request.method, 'POST');
      expect(request.data, <String, dynamic>{
        'username': 'alice',
        'password': 's3cret',
      });
      expect(await storage.read(key: 'jwt_token'), 'jwt-from-server');
      expect(await repository.getToken(), 'jwt-from-server');
    });

    test('服务端 401 时抛出异常，且不写入 token', () async {
      adapter.responseBody = <String, dynamic>{'error': '用户名或密码错误'};
      adapter.statusCode = 401;

      await expectLater(
        repository.login('alice', 'wrong'),
        throwsA(isA<DioException>()),
      );

      expect(
        await storage.read(key: 'jwt_token'),
        isNull,
        reason: '失败不能留下半截凭据，否则后续请求全带着坏 token',
      );
    });
  });

  group('register', () {
    test('POST /auth/register，成功后 token 落盘', () async {
      adapter.responseBody = <String, dynamic>{'token': 'jwt-from-register'};

      await repository.register('bob', 'pw123456');

      final request = adapter.requests.single;
      expect(request.path, '/auth/register');
      expect(request.method, 'POST');
      expect(request.data, <String, dynamic>{
        'username': 'bob',
        'password': 'pw123456',
      });
      expect(await repository.getToken(), 'jwt-from-register');
    });

    test('注册失败（409 重名）时不写入 token', () async {
      adapter.responseBody = <String, dynamic>{'error': '用户名已存在'};
      adapter.statusCode = 409;

      await expectLater(
        repository.register('bob', 'pw123456'),
        throwsA(isA<DioException>()),
      );
      expect(await storage.read(key: 'jwt_token'), isNull);
    });
  });

  group('getToken / logout', () {
    test('getToken 读回已落盘的 token', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': 'existing-token',
      });

      expect(await repository.getToken(), 'existing-token');
      expect(adapter.requests, isEmpty, reason: '读本地凭据不该联网');
    });

    test('logout 只删 jwt_token', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': 'existing-token',
        'server_url': 'http://example.com/api',
      });

      await repository.logout();

      expect(await storage.read(key: 'jwt_token'), isNull);
      expect(
        await storage.read(key: 'server_url'),
        'http://example.com/api',
        reason: '登出不该顺手清掉服务器地址配置',
      );
      expect(adapter.requests, isEmpty);
    });
  });
}
