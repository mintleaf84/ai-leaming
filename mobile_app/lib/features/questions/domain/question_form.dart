/// 建题 / 改题表单的纯逻辑层。
///
/// 为什么把「表单值 + 校验 + 请求体」单独抽出来，而不是全写在页面里：
///
/// 1. 校验规则是**契约的一部分**（题干/答案必填、选择题至少一个选项），
///    必须能在没有 widget 的情况下单测，否则只能靠点界面来验证；
/// 2. 请求体的键名服务端按名字取（`content` / `options` / `answer` / `tags` /
///    `type` / `material`），拼错了不会报错、只会静默丢字段，所以这里只留
///    一个出口 [QuestionFormValues.toPayload]。
library;

import '../../practice/domain/question.dart';

/// 题型。`wire` 是服务端标准值（`fill_blank` 带下划线，不能直接用枚举名）。
enum QuestionType {
  single('single', '单选'),
  multi('multi', '多选'),
  truefalse('truefalse', '判断'),
  fillBlank('fill_blank', '填空');

  const QuestionType(this.wire, this.label);

  /// 与 `POST/PATCH /api/questions` 上 `type` 字段一致的字面值。
  final String wire;

  /// 界面上的中文名。
  final String label;

  /// 未知值一律回落 [single]：服务端将来加了新题型，旧包也不至于崩。
  static QuestionType fromWire(String? raw) {
    for (final type in values) {
      if (type.wire == raw) return type;
    }
    return QuestionType.single;
  }

  /// 选择题（单选/多选）才需要选项。
  bool get isChoice => this == single || this == multi;
}

/// 表单当前值。
class QuestionFormValues {
  const QuestionFormValues({
    required this.content,
    required this.options,
    required this.answer,
    required this.type,
    this.explanation = '',
    this.tags = const <String>[],
    this.material = '',
  });

  /// 从题目详情预填（改题页）。缺字段按空串处理，不会因为
  /// `explanation == null` 让整个表单打不开。
  factory QuestionFormValues.fromQuestion(Question question) {
    return QuestionFormValues(
      content: question.content,
      options: List<String>.of(question.options),
      answer: question.answer ?? '',
      type: QuestionType.fromWire(question.type),
      explanation: question.explanation ?? '',
      tags: List<String>.of(question.tags),
      // 材料优先取纯文本：表单只编辑纯文本，HTML 版本是服务端清洗后的产物。
      material: question.material ?? '',
    );
  }

  final String content;
  final List<String> options;
  final String answer;
  final QuestionType type;
  final String explanation;
  final List<String> tags;

  /// 材料原文（纯文本）。
  final String material;

  /// `POST/PATCH /api/questions` 的请求体。
  ///
  /// 规则：
  /// - 文本字段先 `trim`，全空的**可选**字段直接省略（`explanation` / `material`），
  ///   不然服务端会存下一堆空串；
  /// - 选项与标签去掉空项（用户点了「添加选项」却没填是常态）；
  /// - 非选择题**不带选项**：用户把题型从单选改成填空后，残留的旧选项不能再
  ///   跟着提交（键保留、值为空数组，服务端 schema 要求字段存在）；
  /// - 必填字段即使为空也照发，让服务端返回 400 而不是客户端自己编错误码
  ///   （客户端的 [validateQuestionForm] 已经先拦了一道）。
  Map<String, dynamic> toPayload() {
    final options = type.isChoice
        ? this.options
              .map((option) => option.trim())
              .where((option) => option.isNotEmpty)
              .toList()
        : const <String>[];
    final explanation = this.explanation.trim();
    final material = this.material.trim();

    return <String, dynamic>{
      'content': content.trim(),
      'options': options,
      'answer': answer.trim(),
      'type': type.wire,
      'tags': tags,
      if (explanation.isNotEmpty) 'explanation': explanation,
      if (material.isNotEmpty) 'material': material,
    };
  }
}

/// 校验结果：每个字段一条文案，null 表示通过。
class QuestionFormValidation {
  const QuestionFormValidation({
    this.contentError,
    this.optionsError,
    this.answerError,
  });

  final String? contentError;
  final String? optionsError;
  final String? answerError;

  bool get hasError =>
      contentError != null || optionsError != null || answerError != null;
}

/// 校验表单值。
///
/// 判据来自 §35：题干、答案必填，选择题至少一个选项；材料可以为空。
QuestionFormValidation validateQuestionForm(QuestionFormValues values) {
  final content = values.content.trim();
  final answer = values.answer.trim();
  final options = values.options
      .map((option) => option.trim())
      .where((option) => option.isNotEmpty)
      .toList();

  return QuestionFormValidation(
    contentError: content.isEmpty ? '请填写题干' : null,
    optionsError: options.isEmpty && values.type.isChoice ? '选择题至少要有一个选项' : null,
    answerError: _answerError(answer: answer, type: values.type, options: options),
  );
}

/// 答案校验：必填；选择题的答案必须是选项范围内的字母。
///
/// 范围校验只对 `A` / `AB` 这种纯字母答案生效——填空题的答案可以是任意文本。
String? _answerError({
  required String answer,
  required QuestionType type,
  required List<String> options,
}) {
  if (answer.isEmpty) return '请填写答案';
  if (!type.isChoice) return null;

  final letters = answer.toUpperCase().replaceAll(RegExp(r'[\s,，、]'), '');
  if (!RegExp(r'^[A-Z]+$').hasMatch(letters)) return null;

  final maxIndex = options.length; // A => 1，A/B => 2
  for (final code in letters.codeUnits) {
    if (code - 65 >= maxIndex) return '答案超出了选项范围';
  }
  return null;
}

/// 把「逗号分隔的标签串」拆成标签列表。
///
/// 中英文逗号、顿号、分号、换行都当分隔符（老师复制粘贴时混用是常态），
/// 去重但保留首次出现的顺序。
List<String> parseTags(String raw) {
  final seen = <String>{};
  final tags = <String>[];
  for (final part in raw.split(RegExp(r'[,，、;；\n]+'))) {
    final tag = part.trim();
    if (tag.isEmpty) continue;
    if (seen.add(tag)) tags.add(tag);
  }
  return tags;
}

/// 把标签列表拼回输入框里的样子。
String formatTags(List<String> tags) => tags.join('，');
