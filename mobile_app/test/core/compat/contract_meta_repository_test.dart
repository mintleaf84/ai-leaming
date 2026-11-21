import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';

/// 用 Dio 的 `HttpClientAdapter` 桩住真实网络（与
/// `test/features/recall/recall_repository_test.dart` 同一手法）：断言的是
/// **发出去的请求**和**失败归 null** 的契约，不联网、不碰服务端。
class RecordingAdapter implements HttpClientAdapter {
  RecordingAdapter({this.onFetch});

  final Future<ResponseBody> Function(RequestOptions options)? onFetch;

  final List<RequestOptions> requests = <RequestOptions>[];

  Object? responseBody;
  int statusCode = 200;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (onFetch != null) return onFetch!(options);
    return ResponseBody.fromString(
      jsonEncode(responseBody ?? const <String, dynamic>{}),
      statusCode,
      headers: {
        Headers.contentTypeHeader: <String>['application/json; charset=utf-8'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late RecordingAdapter adapter;
  late ContractMetaRepository repository;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    repository = ContractMetaRepository(dio);
  });

  group('路径', () {
    test('打 /meta（不带 /api 前缀，baseUrl 已含 /api）', () async {
      adapter.responseBody = const <String, dynamic>{
        'contractVersion': 1,
        'minClientVersion': '1.0.0',
        'latestClientVersion': '1.0.0',
        'downloadUrl': null,
        'features': ['questions'],
      };

      final meta = await repository.fetch();

      expect(adapter.requests, hasLength(1));
      expect(
        adapter.requests.single.path,
        '/meta',
        reason: '写成 /api/meta 会拼成 /api/api/meta（404）',
      );
      expect(
        adapter.requests.single.uri.toString(),
        'http://localhost:3000/api/meta',
      );
      expect(meta, isNotNull);
      expect(meta!.contractVersion, 1);
      expect(meta.supports('questions'), isTrue);
    });
  });

  group('失败一律归 null（= serverUnreachable，不阻断）', () {
    test('超时（connectionTimeout）→ null', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
      dio.httpClientAdapter = RecordingAdapter(
        onFetch: (options) async => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionTimeout,
          message: 'connection timed out',
        ),
      );
      final repo = ContractMetaRepository(dio);

      await expectLater(repo.fetch(), completion(isNull));
    });

    test('404（后端还没部署 /meta）→ null，而不是当成「服务端太旧」', () async {
      adapter.statusCode = 404;
      adapter.responseBody = const <String, dynamic>{'error': 'Not Found'};

      await expectLater(repository.fetch(), completion(isNull));
    });

    test('5xx → null', () async {
      adapter.statusCode = 500;
      adapter.responseBody = const <String, dynamic>{'error': 'boom'};

      await expectLater(repository.fetch(), completion(isNull));
    });

    test('响应体不是 JSON 对象（代理回 HTML）→ null', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
      dio.httpClientAdapter = RecordingAdapter(
        onFetch: (options) async => ResponseBody.fromString(
          '<html>bad gateway</html>',
          200,
          headers: {
            Headers.contentTypeHeader: <String>['text/html; charset=utf-8'],
          },
        ),
      );
      final repo = ContractMetaRepository(dio);

      await expectLater(repo.fetch(), completion(isNull));
    });

    test('JSON 是数组而不是对象 → null', () async {
      adapter.responseBody = <Object?>[];

      await expectLater(repository.fetch(), completion(isNull));
    });
  });
}
