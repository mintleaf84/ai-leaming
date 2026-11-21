import 'exam_json.dart';

/// 试卷里的一道题（`GET /papers/{id}` 的 `items[].question`、
/// `POST /papers/{id}/attempts` 的 `questions[]`）。
///
/// 为什么不复用练习页的 `Question`：那个 model 的 `id` 是 `String`（练习接口按字符串
/// 处理题号），而交卷载荷要的是 `questionId: 12`（int）。在这里再转一次类型，
/// 会把「题号到底是哪个」这件事分散到仓库层与界面层；试卷自己持有一份 int 题号，
/// 交卷时不用猜。
class ExamQuestion {
  final int id;
  final String content;
  final List<String> options;

  /// 服务端题型：`single` / `multi` / `truefalse` / `fill_blank`。
  final String type;
  final List<String> tags;
  final String? dimension;

  /// 材料题原文（纯文本），没有材料时为 null。
  final String? material;

  /// 材料题富文本（服务端已按白名单清洗），优先于 [material] 渲染。
  final String? materialHtml;

  /// 正确答案。**未交卷时服务端会把它置空**（防作弊），所以界面不能依赖它。
  final String? answer;

  /// 解析。未交卷时同样可能为 null。
  final String? explanation;

  const ExamQuestion({
    required this.id,
    required this.content,
    required this.options,
    required this.type,
    this.tags = const [],
    this.dimension,
    this.material,
    this.materialHtml,
    this.answer,
    this.explanation,
  });

  bool get isMulti => type == 'multi';
  bool get isTrueFalse => type == 'truefalse';
  bool get isFillBlank => type == 'fill_blank';

  /// 判断题的选项：服务端给选项就以服务端为准，没给就回落「正确 / 错误」。
  ///
  /// 回落只补展示，不改判分：交卷判分在服务端（`checkAnswerCorrectness`），
  /// 客户端提交仍然按字母（A/B）或原文作答。
  List<String> get displayOptions {
    if (options.isNotEmpty) return options;
    if (isTrueFalse) return const <String>['正确', '错误'];
    return const <String>[];
  }

  /// 题型的界面文案。
  String get typeLabel {
    switch (type) {
      case 'multi':
        return '多选题';
      case 'truefalse':
        return '判断题';
      case 'fill_blank':
        return '填空题';
      case 'single':
        return '单选题';
      default:
        return '题目';
    }
  }

  factory ExamQuestion.fromJson(Map<String, dynamic> json) {
    return ExamQuestion(
      id: readInt(json['id']),
      content: readString(json['content']),
      options: readStringList(json['options']),
      type: readString(json['type'], fallback: 'single'),
      tags: readStringList(json['tags']),
      dimension: readNullableString(json['dimension']),
      material: readNullableString(json['material']),
      materialHtml: readNullableString(json['material_html']),
      answer: readNullableString(json['answer']),
      explanation: readNullableString(json['explanation']),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'content': content,
    'options': List<String>.from(options),
    'type': type,
    'tags': List<String>.from(tags),
    'dimension': dimension,
    'material': material,
    'material_html': materialHtml,
    'answer': answer,
    'explanation': explanation,
  };
}

/// 一件作答：交卷载荷的一项。
///
/// `durationMs` 是**这道题停留的时长**（客户端估算）。服务端只用它写
/// `practice_logs.duration_ms` 做统计，不参与判分，所以估算偏差不会影响成绩。
class ExamAnswerPayload {
  final int questionId;
  final String userAnswer;
  final int durationMs;

  const ExamAnswerPayload({
    required this.questionId,
    required this.userAnswer,
    this.durationMs = 0,
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
    'questionId': questionId,
    'userAnswer': userAnswer,
    'durationMs': durationMs,
  };
}

/// 组装交卷载荷（`POST /attempts/{sessionId}/submit` 的 body）。
///
/// 只放**真的作答了**的题：未作答的题由服务端按 `skipped` 处理（契约 §4）。
/// 客户端传一条空答案反而会把「没做」写成「做了但答错」，语义不同，错题本也会
/// 多出一条本来不该有的记录。
///
/// 放在 domain 而不是界面里：这份 body 的字段名是与服务端的契约，值得单独被
/// 单测钉住（`questionId` / `userAnswer` / `durationMs` / `clientKey`）。
Map<String, dynamic> buildExamSubmitBody({
  required List<ExamQuestion> questions,
  required Map<int, String> answers,
  required Map<int, int> durationsMs,
  required String clientKey,
}) {
  final items = <Map<String, dynamic>>[];
  for (final question in questions) {
    final raw = (answers[question.id] ?? '').trim();
    if (raw.isEmpty) continue;
    items.add(
      ExamAnswerPayload(
        questionId: question.id,
        userAnswer: raw,
        durationMs: (durationsMs[question.id] ?? 0).clamp(0, 86400000),
      ).toJson(),
    );
  }
  return <String, dynamic>{'answers': items, 'clientKey': clientKey};
}
