import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/error/user_message.dart';
import 'package:mobile_app/features/practice/domain/practice_exceptions.dart';

/// 守的是**给用户看的那句话**：
///
/// 1. 题号脏数据不能把 `FormatException: Invalid radix-10 number ...` 甩到界面上；
/// 2. `rawValue` 只用于日志，不许出现在 `toString()` 里（否则等于把内部数据
///    拼进提示）；
/// 3. 它是 `UserFacingException`，所以 `userMessageOf` 会原样透传业务文案，
///    不会被折成「出了点问题，请重试」。
void main() {
  test('userMessage 是面向用户的可执行提示', () {
    const error = InvalidQuestionIdException('abc');
    expect(error.userMessage, '题目编号异常，请刷新后重试');
  });

  test('toString 等于 userMessage，且不泄漏 rawValue', () {
    const error = InvalidQuestionIdException('abc-123');
    expect(error.toString(), '题目编号异常，请刷新后重试');
    expect(error.toString(), isNot(contains('abc-123')));
  });

  test('实现 UserFacingException，userMessageOf 原样透传', () {
    const error = InvalidQuestionIdException('abc');
    expect(error, isA<UserFacingException>());
    expect(userMessageOf(error), '题目编号异常，请刷新后重试');
  });
}
