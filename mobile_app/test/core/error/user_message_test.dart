import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/user_message.dart';

/// 错误文案统一（审计 #24）。
///
/// 这个文件守两条线：
/// 1. **每种失败都有自己的话**：超时、断网、401/403/404/5xx、解析失败各自可辨，
///    而不是全都落成「加载失败」；
/// 2. **不泄漏**：文案里不许出现堆栈、异常类名、URL、响应体片段。用户看不懂
///    `DioException [connection error] ... uri=http://...`，而且它会把服务器地址
///    暴露在界面上（截图分享时就带出去了）。
DioException _badResponse(int status, {Object? data}) {
  final options = RequestOptions(path: '/practice/session');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<Object?>(
      requestOptions: options,
      statusCode: status,
      data: data,
    ),
  );
}

DioException _type(DioExceptionType type) {
  return DioException(
    requestOptions: RequestOptions(path: '/practice/session'),
    type: type,
    message: 'raw socket detail that must not reach the UI',
  );
}

void main() {
  group('按类型映射', () {
    test('超时', () {
      expect(
        userMessageOf(_type(DioExceptionType.receiveTimeout)),
        contains('超时'),
      );
      expect(
        userMessageOf(TimeoutException('slow')),
        contains('超时'),
        reason: '非 Dio 的 TimeoutException 也要认得',
      );
    });

    test('断网', () {
      expect(
        userMessageOf(_type(DioExceptionType.connectionError)),
        contains('网络'),
      );
      expect(
        userMessageOf(_type(DioExceptionType.unknown)),
        contains('网络'),
        reason: 'unknown 多数是底层 socket 断开，按断网给话',
      );
    });

    test('401 登录过期', () {
      expect(userMessageOf(_badResponse(401)), contains('登录'));
    });

    test('403 无权限', () {
      expect(userMessageOf(_badResponse(403)), contains('权限'));
    });

    test('404 内容不存在', () {
      final message = userMessageOf(_badResponse(404));
      expect(message, contains('不存在'));
      expect(message, contains('404'), reason: '保留状态码便于定位，且不是泄漏');
    });

    test('5xx 服务端故障', () {
      final message = userMessageOf(_badResponse(503));
      expect(message, contains('服务器'));
      expect(message, contains('503'));
    });

    test('解析失败', () {
      expect(
        userMessageOf(const FormatException('Unexpected character at 0')),
        contains('无法解析'),
      );
      expect(userMessageOf(TypeError()), contains('无法解析'));
    });

    test('未知异常兜底', () {
      expect(userMessageOf(StateError('boom')), '出了点问题，请重试');
    });
  });

  group('不泄漏', () {
    test('文案里没有堆栈、类名、URL 与响应体', () {
      final error = DioException(
        requestOptions: RequestOptions(
          path: '/practice/session/1/submit',
          baseUrl: 'http://192.168.1.9:3000/api',
        ),
        type: DioExceptionType.badResponse,
        response: Response<Object?>(
          requestOptions: RequestOptions(path: '/practice/session/1/submit'),
          statusCode: 500,
          data: <String, dynamic>{'error': 'SQLITE_BUSY at db.ts:42'},
        ),
        stackTrace: StackTrace.current,
      );

      final message = userMessageOf(error);

      expect(message, isNot(contains('DioException')));
      expect(message, isNot(contains('Exception')));
      expect(message, isNot(contains('http')));
      expect(message, isNot(contains('192.168')));
      expect(message, isNot(contains('SQLITE_BUSY')));
      expect(message, isNot(contains('#0')));
    });

    test('业务异常自带的可展示文案优先（不被归到「出了点问题」）', () {
      const error = _UserFacingTestError('本地题库为空，请联网同步');

      expect(userMessageOf(error), '本地题库为空，请联网同步');
    });
  });
}

class _UserFacingTestError implements UserFacingException {
  const _UserFacingTestError(this.userMessage);

  @override
  final String userMessage;

  @override
  String toString() => 'raw: $userMessage';
}
