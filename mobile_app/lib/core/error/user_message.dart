import 'dart:async';

import 'package:dio/dio.dart';

/// 自带「可直接展示文案」的异常。
///
/// 业务层已经知道该怎么说人话（例如练习模块的「本地题库为空或已超过 7 天
/// 未刷新」），这种异常不该被 [userMessageOf] 归到「出了点问题」里。
/// 实现方必须保证 [userMessage] 里不含堆栈、类名或原始载荷。
abstract class UserFacingException implements Exception {
  String get userMessage;
}

/// 把任意异常翻译成一句用户能看懂的话（审计 #24：错误文案统一）。
///
/// 界面上一律用它，不要用 `error.toString()`：
/// - `DioException.toString()` 会把 URL、请求方法、甚至响应体带进 UI；
/// - `FormatException` 会把半截 JSON 打给用户；
/// - 裸 `Exception('xxx')` 至少带一个 `Exception:` 前缀。
///
/// 这里**只**按类型/状态码给固定文案，绝不拼接原始异常内容，所以不会泄漏
/// 堆栈、路径或服务端载荷。状态码保留在文案里（如「服务器出了点问题（500）」），
/// 那是定位问题的最小信息，不是泄漏。
///
/// 调用方在 catch 里仍应 `debugPrint` 原始异常，排查靠日志，不靠界面。
String userMessageOf(Object error) {
  if (error is UserFacingException) {
    return error.userMessage;
  }

  if (error is TimeoutException) {
    return '网络超时了，请稍后重试';
  }

  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return '网络超时了，请稍后重试';
      case DioExceptionType.connectionError:
        return '网络好像断了，请检查网络后重试';
      case DioExceptionType.badCertificate:
        return '服务器证书异常，请检查服务器地址';
      case DioExceptionType.cancel:
        return '请求被取消了，请重试';
      case DioExceptionType.badResponse:
        return _messageForStatus(error.response?.statusCode);
      case DioExceptionType.unknown:
        return '网络好像断了，请检查网络后重试';
    }
  }

  // 解析失败：json 结构变了、字段类型对不上（`type 'String' is not a subtype of ...`
  // 会以 TypeError 形式抛出来）。
  if (error is FormatException || error is TypeError) {
    return '服务器返回的内容无法解析，请稍后重试';
  }

  return '出了点问题，请重试';
}

String _messageForStatus(int? status) {
  if (status == null) {
    return '出了点问题，请重试';
  }
  if (status == 401) {
    return '登录已过期，请重新登录';
  }
  if (status == 403) {
    return '没有权限进行这个操作';
  }
  if (status == 404) {
    return '请求的内容不存在（404），请刷新后重试';
  }
  if (status >= 500) {
    return '服务器出了点问题（$status），请稍后重试';
  }
  if (status >= 400) {
    return '请求未能完成（$status），请稍后重试';
  }
  return '出了点问题，请重试';
}
