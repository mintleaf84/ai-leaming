// 纯 domain 单测，不 pump Widget。
//
// 这里钉住的是「App 认识哪些题型」这条唯一口径。它刻意比服务端契约窄：
// 不在集合里的题型一律走「不可作答 + 提示更新 App」，而不是按单选渲染、
// 没有选项可点、静默判错（口径见 2026-11 产品决策）。
// `fill_blank` 于 2026-11-24 放开（练习屏已有逐空作答控件）。
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
    test('已支持的选择题型与填空可作答', () {
      expect(_question('single').isPracticable, isTrue);
      expect(_question('multi').isPracticable, isTrue);
      expect(_question('truefalse').isPracticable, isTrue);
      // 填空在练习屏按空序渲染输入框（fill_blank_answer_fields.dart）。
      expect(_question('fill_blank').isPracticable, isTrue);
    });

    test('isFillBlank 只认 fill_blank（其它题型不冒充逐空作答）', () {
      expect(_question('fill_blank').isFillBlank, isTrue);
      expect(_question('single').isFillBlank, isFalse);
      expect(_question('').isFillBlank, isFalse);
    });

    test('契约外的未知取值一律不可作答（宁可提示更新，不静默按单选渲染）', () {
      expect(_question('drag_match').isPracticable, isFalse);
      expect(_question('').isPracticable, isFalse);
    });
  });
}
