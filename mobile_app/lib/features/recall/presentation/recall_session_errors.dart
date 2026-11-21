part of 'recall_session_controller.dart';

/// 这次提交失败属于哪一类——决定界面给「重试」还是「跳过」。
///
/// 分这两类的唯一理由：**同一份载荷重发有没有可能成功**。
/// 判分屏只有一个主操作位，选错了会把用户堵死（一直点"重试"永远不动）。
enum RecallSubmitFailure {
  /// 结果未知（超时 / 连不上 / 5xx / 网关卡住）：服务端可能**已经**写进去了，
  /// 所以只能重放同一份载荷 + 同一个 `clientKey`，靠服务端幂等去重。
  unknown,

  /// 服务端明确拒绝（400/403/404/422 等 4xx）：它读懂了请求并拒绝了，
  /// 同一份载荷再发一次必然再被拒，重试按钮就是死路。
  rejected,

  /// 会话失效（401）：交给全局拦截器登出，界面不锁死。
  sessionExpired,
}

/// 按异常形态分类（纯函数，测试可直接断言）。
///
/// 非 Dio 异常（例如响应形状漂移抛的 [FormatException]）一律算 [unknown]：
/// 我们拿到了一个 200 但读不懂，说明服务端**很可能已经落库**了，
/// 这时重放同一个 key 才是最安全的动作。
RecallSubmitFailure classifySubmitFailure(Object error) {
  if (error is! DioException) return RecallSubmitFailure.unknown;

  switch (error.type) {
    case DioExceptionType.badResponse:
      final status = error.response?.statusCode;
      if (status == 401) return RecallSubmitFailure.sessionExpired;
      if (status != null && status >= 500) return RecallSubmitFailure.unknown;
      // 其余 4xx：服务端理解并拒绝了这份载荷（幂等键冲突有专门语义，
      // 不会走到这里——重复提交返回的是 200 + duplicate: true）
      if (status != null && status >= 400) return RecallSubmitFailure.rejected;
      return RecallSubmitFailure.unknown;

    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
    case DioExceptionType.badCertificate:
    case DioExceptionType.cancel:
    case DioExceptionType.unknown:
      return RecallSubmitFailure.unknown;
  }
}

/// 这张卡是否在服务端已经不存在（归档时的 404）。
bool isCardGoneError(Object error) {
  return error is DioException &&
      error.type == DioExceptionType.badResponse &&
      error.response?.statusCode == 404;
}

/// 把异常翻译成用户能读懂的一句话。
///
/// 界面上一律展示这个（而不是 `DioException` 的 `toString()`）：
/// 「加载失败」这种没有信息量的文案会让用户只能靠重试碰运气。
String describeRecallError(Object error) {
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
        if (status == 403) return '没有权限访问这份回忆卡。';
        if (status == 404) return '这张卡在服务器上已经不存在了。';
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

/// 尽力从错误响应里取一句人话（后端形状：`{error: {message}}` 或 `{message}`）。
String? _serverErrorMessage(Object? data) {
  if (data is Map) {
    final error = data['error'];
    if (error is Map) {
      final message = error['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
  }
  return null;
}
