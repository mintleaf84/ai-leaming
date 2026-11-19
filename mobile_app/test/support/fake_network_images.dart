import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// 让 widget 测试里的 `NetworkImage` 不再真的联网。
///
/// 为什么需要：`flutter_test` 默认把所有 HTTP 请求挡成 400，于是任何
/// `NetworkImage` 都会抛 `NetworkImageLoadException`——那是**测试环境的**报错，
/// 却会把用例判红（设置页头像就是这种情况，`lib` 里写死了一个 ui-avatars URL）。
///
/// 做法：装一个 `HttpOverrides`，对任何 URL 都返回同一张 1×1 透明 PNG。
/// 这样被测代码走的仍是真实的 `NetworkImage` 解码路径，只是数据源换成了本地
/// 常量——比在每个用例里 `takeException()` 把错误捞掉更接近真实行为，也不会
/// 掩盖别的图片相关缺陷。
///
/// 用法：`setUpAll(useFakeNetworkImages);`，与 `useFakeSecureStorage()` 并列。
void useFakeNetworkImages() {
  HttpOverrides.global = _PngHttpOverrides();
}

/// 1×1 透明 PNG（最小合法图片，解码器不会报错）。
final Uint8List _transparentPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wF/'
  '2mX0AAAAAElFTkSuQmCC',
);

class _PngHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _PngHttpClient();
}

/// 只实现 `NetworkImage` 真正用到的那几个成员，其余交给 `noSuchMethod`
/// （声明了它之后不必把 `HttpClient` 的几十个成员都写一遍）。
class _PngHttpClient implements HttpClient {
  @override
  bool autoUncompress = true;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _PngRequest();

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async =>
      _PngRequest();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _PngRequest implements HttpClientRequest {
  @override
  final HttpHeaders headers = _PngHeaders();

  @override
  Future<HttpClientResponse> close() async => _PngResponse();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _PngResponse implements HttpClientResponse {
  @override
  int get statusCode => HttpStatus.ok;

  @override
  int get contentLength => _transparentPng.length;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return Stream<List<int>>.value(_transparentPng).listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _PngHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
