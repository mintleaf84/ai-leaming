import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Dio 的 `HttpClientAdapter` 共享桩：把发出去的请求记下来，把预设响应塞回去。
///
/// 这些测试断言的是**客户端发出去的请求**（路径、动词、查询参数、载荷）和
/// **客户端对响应的处理**（判分、降级、分块拼接），不是服务端实现——所以
/// 不联网、不碰数据库；后端契约不变时，换实现也不用改这些测试。
///
/// 两种用法：
/// 1. 单一响应：`RecordingAdapter(responseBody: {...}, statusCode: 200)`；
/// 2. 按路径给不同响应（或模拟断网）：
///    ```dart
///    RecordingAdapter(handler: (options) {
///      if (options.path == '/chat') return sseBody([...]);
///      throw offlineException(options);
///    });
///    ```
/// 设了 `handler` 后 `responseBody` / `statusCode` 不再生效。
class RecordingAdapter implements HttpClientAdapter {
  RecordingAdapter({
    this.handler,
    this.responseBody = const <String, dynamic>{},
    this.statusCode = 200,
    this.contentType = 'application/json; charset=utf-8',
  });

  /// 自定义响应（可按 [RequestOptions.path] 分支，也可抛 [offlineException]）。
  ///
  /// 可在构造后赋值，便于 `setUp` 里先建 adapter、再按用例换响应。
  FutureOr<ResponseBody> Function(RequestOptions options)? handler;

  /// 默认响应体，Map/List 均可，会被 `jsonEncode` 后返回。
  Object? responseBody;

  int statusCode;

  /// 为 null 时不带 Content-Type（模拟非 JSON 响应）。
  String? contentType;

  /// 按调用顺序记录的全部请求。
  final List<RequestOptions> requests = <RequestOptions>[];

  List<RequestOptions> get posts => requests
      .where((request) => request.method == 'POST')
      .toList(growable: false);

  List<RequestOptions> get gets => requests
      .where((request) => request.method == 'GET')
      .toList(growable: false);

  List<RequestOptions> get deletes => requests
      .where((request) => request.method == 'DELETE')
      .toList(growable: false);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final custom = handler;
    if (custom != null) {
      return await custom(options);
    }
    return jsonBody(
      responseBody,
      statusCode: statusCode,
      contentType: contentType,
    );
  }

  @override
  void close({bool force = false}) {}
}

/// 把 [body] 序列化成 JSON 响应。
ResponseBody jsonBody(
  Object? body, {
  int statusCode = 200,
  String? contentType = 'application/json; charset=utf-8',
}) {
  return ResponseBody.fromString(
    jsonEncode(body ?? const <String, dynamic>{}),
    statusCode,
    headers: contentType == null
        ? const <String, List<String>>{}
        : <String, List<String>>{
            Headers.contentTypeHeader: <String>[contentType],
          },
  );
}

/// 把若干字节块拼成一条响应流，用于 SSE 这类需要逐块消费的端点。
///
/// 块边界由调用方决定：可以故意切在半行、甚至切在多字节字符中间，
/// 用来验证客户端自己的行缓冲/解码逻辑。
ResponseBody sseBody(List<List<int>> chunks, {int statusCode = 200}) {
  return ResponseBody(
    Stream<Uint8List>.fromIterable(
      chunks.map((chunk) => Uint8List.fromList(chunk)),
    ),
    statusCode,
    headers: const <String, List<String>>{
      Headers.contentTypeHeader: <String>['text/event-stream'],
    },
  );
}

/// 模拟「连不上服务器」：抛一个没有 `response` 的 [DioException]。
///
/// 业务代码正是靠 `error.response == null` 区分「断网可降级」与
/// 「服务端明确拒绝（4xx/5xx）必须抛出」——用带 response 的异常会让
/// 降级逻辑永远测不到。
Never offlineException(RequestOptions options, {String message = '模拟断网'}) {
  throw DioException(
    requestOptions: options,
    type: DioExceptionType.connectionError,
    message: message,
  );
}
