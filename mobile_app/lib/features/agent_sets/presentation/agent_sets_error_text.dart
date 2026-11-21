import 'package:dio/dio.dart';

import '../../../core/error/user_message.dart';

/// 把题集相关的异常变成一句人话。
///
/// 为什么不复用 `describeExamError` / `describeRecallError`：两份文案都绑在各自
/// 的业务语义上（「这份试卷不存在」「这张卡已经不存在了」），直接借用会把用户
/// 引到错的页面。这里保留同一套 Dio 错误分派，只换业务话术。
String describeAgentSetsError(Object error) {
  if (error is FormatException) {
    final message = error.message.trim();
    return message.isEmpty ? '服务器返回的内容看不懂，请检查服务器地址。' : message;
  }

  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return '网络超时了，检查一下网络再试一次。';
      case DioExceptionType.connectionError:
        return '连不上服务器，检查一下网络或服务器地址。';
      case DioExceptionType.badCertificate:
        return '服务器证书不受信任，请确认服务器地址。';
      case DioExceptionType.cancel:
        return '请求被取消了，再试一次。';
      case DioExceptionType.badResponse:
        final status = error.response?.statusCode;
        if (status == 401) return '登录已过期，请重新登录后再来。';
        if (status == 403) return '没有权限访问这套题。';
        if (status == 404) return '这套题在服务器上已经不存在了。';
        if (status == 409) return '这套题的状态刚刚变过，刷新后再试。';
        if (status == 400 || status == 422) {
          final serverMessage = _serverErrorMessage(error.response?.data);
          if (serverMessage != null) return serverMessage;
          return '这套题暂时不能这样操作，刷新后再试。';
        }
        if (status != null && status >= 500) {
          return '服务器出了点问题（$status），稍后再试。';
        }
        final serverMessage = _serverErrorMessage(error.response?.data);
        if (serverMessage != null) return serverMessage;
        return status == null ? '服务器返回了异常。' : '服务器拒绝了这次请求（$status）。';
      case DioExceptionType.unknown:
        return '网络好像断了，检查一下网络再试一次。';
    }
  }

  return '出了一点问题，稍后再试。';
}

/// 判分失败（走练习仓库）的文案。
///
/// 练习层会抛自带人话的业务异常（如离线缓存不可用），那句文案比 Dio 分派更
/// 准确；其余情况回落到题集自己的分派，避免把 `DioException` 原文打到界面上。
String describeAgentSetAnswerError(Object error) {
  if (error is UserFacingException) return error.userMessage;
  return describeAgentSetsError(error);
}

/// 尽力从错误响应里取一句人话（后端形状：`{error: {message}}` 或 `{message}`）。
String? _serverErrorMessage(Object? data) {
  final payload = _mapOf(data);
  if (payload == null) return null;
  final nested = _mapOf(payload['error']);
  if (nested != null) {
    final message = nested['message'];
    if (message is String && message.trim().isNotEmpty) {
      return message.trim();
    }
  }
  final message = payload['message'];
  if (message is String && message.trim().isNotEmpty) return message.trim();
  return null;
}

Map<String, dynamic>? _mapOf(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}
