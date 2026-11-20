import 'package:dio/dio.dart';

/// 把试卷相关的异常变成一句人话。
///
/// 为什么不复用 `describeRecallError`：那份函数的文案与语义都绑在回忆自测上
/// （「这张卡在服务器上已经不存在了」），而且它是 recall feature 的私有函数。
/// 这里保留同一套 Dio 错误分派，额外处理自动组卷的 `shortfall` 响应。
String describeExamError(Object error) {
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
        if (status == 403) return '没有权限访问这份试卷。';
        if (status == 404) return '这份试卷在服务器上已经不存在了。';
        if (status == 409) return '这张卷子已经有人作答过，不能删除。';
        if (status == 400 || status == 422) {
          final shortfall = _readShortfall(error.response?.data);
          if (shortfall != null) return shortfall;
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

/// 自动组卷凑不满题量时的可读提示（契约 §3：400 + `{requested, available, shortfall}`）。
///
/// 服务端可能把这三个数放在根上，也可能包在 `error` 里；两种都认。
String? _readShortfall(Object? data) {
  final payload = _mapOf(data);
  if (payload == null) return null;
  final nested = _mapOf(payload['error']);
  final source = nested ?? payload;
  final requested = _intOf(source['requested']);
  final available = _intOf(source['available']);
  if (requested == null || available == null) return null;
  if (available >= requested) return null;
  return '符合条件的题只有 $available 道，凑不满 $requested 道。'
      '减少题量、放宽考点，或者先多刷一些题。';
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

int? _intOf(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim());
  return null;
}
