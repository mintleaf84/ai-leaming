import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/questions/domain/question_form.dart';

/// 表单纯逻辑的单测：校验规则与请求体形状。
///
/// 这些是**契约**：题干的必填、选择题至少一个选项、`material` 为空时不许
/// 出现在请求体里。放在这里测比在 widget test 里点界面稳得多——改版式不会
/// 让它们变红，字段名/规则改了才会。
void main() {
  QuestionFormValues values({
    String content = '题干',
    List<String> options = const <String>['甲', '乙'],
    String answer = 'A',
    QuestionType type = QuestionType.single,
    String explanation = '',
    List<String> tags = const <String>[],
    String material = '',
  }) {
    return QuestionFormValues(
      content: content,
      options: options,
      answer: answer,
      type: type,
      explanation: explanation,
      tags: tags,
      material: material,
    );
  }

  group('validateQuestionForm', () {
    test('题干为空 → 报错', () {
      final result = validateQuestionForm(values(content: '   '));

      expect(result.contentError, '请填写题干');
      expect(result.hasError, isTrue);
    });

    test('答案为空 → 报错', () {
      final result = validateQuestionForm(values(answer: ' '));

      expect(result.answerError, '请填写答案');
    });

    test('选择题没有任何选项 → 报错', () {
      final result = validateQuestionForm(
        values(options: const <String>['', '  '], answer: 'A'),
      );

      expect(result.optionsError, '选择题至少要有一个选项');
    });

    test('判断题 / 填空题没有选项是合法的', () {
      for (final type in <QuestionType>[
        QuestionType.truefalse,
        QuestionType.fillBlank,
      ]) {
        final result = validateQuestionForm(
          values(
            options: const <String>['', ''],
            answer: '正确',
            type: type,
          ),
        );

        expect(result.hasError, isFalse, reason: '${type.wire} 不需要选项');
      }
    });

    test('选择题答案超出选项范围 → 报错', () {
      final result = validateQuestionForm(
        values(options: const <String>['甲', '乙'], answer: 'C'),
      );

      expect(result.answerError, '答案超出了选项范围');
    });

    test('多选题答案 AB 在两选项内合法，ABC 越界', () {
      final ok = validateQuestionForm(
        values(type: QuestionType.multi, answer: 'AB'),
      );
      final bad = validateQuestionForm(
        values(type: QuestionType.multi, answer: 'ABC'),
      );

      expect(ok.hasError, isFalse);
      expect(bad.answerError, '答案超出了选项范围');
    });

    test('填空题答案可以是任意文本', () {
      final result = validateQuestionForm(
        values(type: QuestionType.fillBlank, options: const <String>[], answer: 'A+B'),
      );

      expect(result.hasError, isFalse);
    });

    test('全部合法时没有任何错误', () {
      final result = validateQuestionForm(values());

      expect(result.hasError, isFalse);
      expect(result.contentError, isNull);
      expect(result.optionsError, isNull);
      expect(result.answerError, isNull);
    });
  });

  group('toPayload', () {
    test('材料为空时请求体里没有 material 键（不报错、不存空串）', () {
      final payload = values(material: '   ').toPayload();

      expect(payload.containsKey('material'), isFalse);
      expect(payload['content'], '题干');
    });

    test('解析为空时请求体里没有 explanation 键', () {
      final payload = values(explanation: ' ').toPayload();

      expect(payload.containsKey('explanation'), isFalse);
    });

    test('选项去掉空项并 trim，标签按数组发', () {
      final payload = values(
        options: const <String>['  甲 ', '', '乙'],
        tags: const <String>['教育学', '教育目的'],
        explanation: '解析正文',
        material: '材料正文',
      ).toPayload();

      expect(payload['options'], <String>['甲', '乙']);
      expect(payload['tags'], <String>['教育学', '教育目的']);
      expect(payload['explanation'], '解析正文');
      expect(payload['material'], '材料正文');
      expect(payload['type'], 'single');
      expect(payload['answer'], 'A');
    });

    test('题型改成填空后不再提交残留选项', () {
      final payload = values(
        type: QuestionType.fillBlank,
        options: const <String>['甲', '乙'],
        answer: '乙',
      ).toPayload();

      expect(payload['options'], isEmpty);
      expect(payload['type'], 'fill_blank');
    });
  });

  group('题型与标签解析', () {
    test('QuestionType.fromWire 认服务端字面值，未知值回落单选', () {
      expect(QuestionType.fromWire('multi'), QuestionType.multi);
      expect(QuestionType.fromWire('fill_blank'), QuestionType.fillBlank);
      expect(QuestionType.fromWire('essay'), QuestionType.single);
      expect(QuestionType.fromWire(null), QuestionType.single);
    });

    test('parseTags 支持中英文逗号/顿号/分号/换行并去重', () {
      final tags = parseTags(' 教育学，教育目的、教育学;德育\n教育学原理 ');

      expect(tags, <String>['教育学', '教育目的', '德育', '教育学原理']);
    });

    test('parseTags 对空串返回空列表', () {
      expect(parseTags('  '), isEmpty);
    });

    test('formatTags 用中文逗号拼回去，能再被 parseTags 解开', () {
      const tags = <String>['教育学', '教育目的'];

      expect(parseTags(formatTags(tags)), tags);
    });
  });

  group('fromQuestion 预填', () {
    test('字段齐全时原样带过来', () {
      const question = Question(
        id: '42',
        content: '题干原文',
        options: <String>['甲', '乙', '丙'],
        type: 'multi',
        tags: <String>['教育学'],
        explanation: '解析原文',
        answer: 'AB',
        material: '材料原文',
      );

      final values = QuestionFormValues.fromQuestion(question);

      expect(values.content, '题干原文');
      expect(values.options, <String>['甲', '乙', '丙']);
      expect(values.type, QuestionType.multi);
      expect(values.answer, 'AB');
      expect(values.explanation, '解析原文');
      expect(values.tags, <String>['教育学']);
      expect(values.material, '材料原文');
    });

    test('解析/答案/材料缺失时给空串，不会让表单打不开', () {
      const question = Question(
        id: '7',
        content: '只有题干',
        options: <String>[],
        tags: <String>[],
      );

      final values = QuestionFormValues.fromQuestion(question);

      expect(values.answer, '');
      expect(values.explanation, '');
      expect(values.material, '');
      expect(values.type, QuestionType.single);
    });
  });
}
