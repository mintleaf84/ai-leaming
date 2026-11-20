import 'agent_set_json.dart';

/// 一套 AI 题集里的一道题（`GET /agent-sets/{id}` 的 `questions[]`）。
///
/// 与试卷的 `ExamQuestion` 分开落地：题集的题号是服务端 `questions.id`（int），
/// 但作答走的是**练习判分**（`POST /practice/session/:id/submit`，题号按字符串
/// 处理），所以这里保留 int 题号 + 一个 [idString] 给判分用，界面不用自己转。
///
/// **不含答案**（契约 §4.2）：作答前拿到 `answer`/`explanation` 就说明服务端
/// 违反了契约，这里也不读——判分结果一律以提交响应为准（见练习控制器）。
class AgentQuestion {
  final int id;
  final String content;
  final List<String> options;

  /// `single` / `multi` / `truefalse` / `fill_blank`。
  final String type;
  final List<String> tags;
  final String? dimension;

  /// 材料题原文（纯文本）；无材料时为 null。
  final String? material;

  /// 材料题富文本（服务端已按白名单清洗），优先于 [material] 渲染。
  final String? materialHtml;

  /// 批次内顺序（1..n）；服务端没给时为 null，界面用列表下标。
  final int? position;

  /// 服务端标记「这题有问题」的题不会出现在列表里；留下这个字段是为了
  /// 在报错后本地移除时保持同一套数据结构（不另造一个「已移除」的空壳）。
  final bool flagged;

  const AgentQuestion({
    required this.id,
    required this.content,
    required this.options,
    required this.type,
    this.tags = const <String>[],
    this.dimension,
    this.material,
    this.materialHtml,
    this.position,
    this.flagged = false,
  });

  bool get isMulti => type == 'multi';
  bool get isTrueFalse => type == 'truefalse';

  /// 单选/判断也能走选项卡片：判断题没有选项时回落「正确 / 错误」。
  List<String> get displayOptions {
    if (options.isNotEmpty) return options;
    if (isTrueFalse) return const <String>['正确', '错误'];
    return const <String>[];
  }

  /// 判断题没有选项时，提交值必须是服务端认的「正确 / 错误」原文。
  bool get usesFallbackTrueFalseOptions => options.isEmpty && isTrueFalse;

  /// 判分接口的题号口径（字符串）。
  String get idString => id.toString();

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

  /// 选项字母：A/B/C…（超过 26 个回落数字，题集单题选项不会到这一步）。
  static String labelAt(int index) {
    if (index < 26) return String.fromCharCode(65 + index);
    return '${index + 1}';
  }

  factory AgentQuestion.fromJson(Map<String, dynamic> json) {
    return AgentQuestion(
      id: readInt(json['id'] ?? json['questionId']),
      content: readString(json['content'] ?? json['stem']),
      options: readStringList(json['options']),
      type: readString(json['type'], fallback: 'single'),
      tags: readStringList(json['tags']),
      dimension: readNullableString(json['dimension']),
      material: readNullableString(json['material']),
      materialHtml: readNullableString(json['material_html']),
      position: readNullableInt(json['position'] ?? json['order']),
      flagged: readBool(json['flagged']),
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
    'position': position,
    'flagged': flagged,
  };
}
