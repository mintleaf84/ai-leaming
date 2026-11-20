import '../../../core/error/user_message.dart';

/// 题号不是数字：服务端契约被破坏，或本地缓存里混进了脏数据。
///
/// 之前 `int.parse(questionId)` 直接抛 `FormatException`，界面会把它
/// `toString()` 出来（`FormatException: Invalid radix-10 number ...`）——
/// 用户既看不懂，也拿不到「接下来该做什么」。这里换成业务错误，
/// [userMessage] 直接告诉用户刷新（审计 #24）。
///
/// [rawValue] 只用于日志排查，**不进** [toString]/[userMessage]。
class InvalidQuestionIdException implements UserFacingException {
  const InvalidQuestionIdException(this.rawValue);

  final String rawValue;

  @override
  String get userMessage => '题目编号异常，请刷新后重试';

  @override
  String toString() => userMessage;
}
