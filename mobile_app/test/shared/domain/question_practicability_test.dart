// 纯 domain 单测，不 pump Widget。
//
// 这里钉住的是「App 认识哪些题型」这条唯一口径。它刻意比服务端契约窄：
// fill_blank 在契约里合法，但练习屏没有作答控件——把它算成「可练习」只会
// 让用户对着空选项白挨一个错。放开的那天删掉断言即可（见实现文件注释）。
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/shared/domain/question.dart';
import 'package:mobile_app/shared/domain/question_practicability.dart';

Question _question(String type) => Question(
  id: 'q-1',
  content: '题干',
  options: const <String>['甲', '乙'],
  type: type,
);

void main() {
  group('Question.isPracticable（当前版本可作答的题型）', () {
    test('已支持的三种选择题型可作答', () {
      expect(_question('single').isPracticable, isTrue);
      expect(_question('multi').isPracticable, isTrue);
      expect(_question('truefalse').isPracticable, isTrue);
    });

    test('契约里合法但本版本没有作答控件的题型不可作答', () {
      // 填空是 GET /api/questions type 枚举的合法值，练习 UI 未实现。
      expect(_question('fill_blank').isPracticable, isFalse);
    });

    test('契约外的未知取值一律不可作答（宁可提示更新，不静默按单选渲染）', () {
      expect(_question('drag_match').isPracticable, isFalse);
      expect(_question('').isPracticable, isFalse);
    });
  });
}
