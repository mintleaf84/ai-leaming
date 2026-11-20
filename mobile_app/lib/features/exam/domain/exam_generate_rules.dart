/// 自动组卷规则（`POST /papers/generate`）。
///
/// 只带界面真的会改的字段：`dimensions` / `types` / `excludeRecentDays` 保持服务端
/// 默认（客观题、不排除近期题），省掉三个「永远用默认值的下拉框」。
/// 契约 §3 定义了它们，将来要开放时在这里加字段即可，服务端不需要改。
class ExamGenerateRules {
  final String title;

  /// `timed` 或 `fixed`。
  final String kind;

  /// 限时分钟数；`kind == fixed` 时必须为 null。
  final int? durationMinutes;
  final int count;

  /// 限定考点（tag）。空表示不限。
  final List<String> tags;

  /// 三档权重：做错过的题 / 掌握度低的题 / 没做过的新题。
  final double wrongWeight;
  final double weakWeight;
  final double freshWeight;

  const ExamGenerateRules({
    required this.title,
    required this.kind,
    this.durationMinutes,
    required this.count,
    this.tags = const [],
    this.wrongWeight = 0.34,
    this.weakWeight = 0.33,
    this.freshWeight = 0.33,
  });

  bool get isTimed => kind == 'timed';

  Map<String, dynamic> toJson() => <String, dynamic>{
    'title': title,
    'kind': kind,
    if (isTimed && durationMinutes != null) 'durationMinutes': durationMinutes,
    'count': count,
    if (tags.isNotEmpty) 'tags': List<String>.from(tags),
    'weights': <String, double>{
      'wrong': wrongWeight,
      'weak': weakWeight,
      'fresh': freshWeight,
    },
  };
}

/// 权重档位。
///
/// 为什么用四个预设而不是三条滑块：三条滑块要满足「和为 1」，手机上要么互相
/// 联动（动一条另两条乱跳），要么允许和不为 1（服务端按比例算，用户却看不出来）。
/// 预设把这件事变成一次选择，且每个预设都能一句话说清。
class ExamWeightPreset {
  final String key;
  final String label;
  final String hint;
  final double wrong;
  final double weak;
  final double fresh;

  const ExamWeightPreset({
    required this.key,
    required this.label,
    required this.hint,
    required this.wrong,
    required this.weak,
    required this.fresh,
  });

  static const ExamWeightPreset balanced = ExamWeightPreset(
    key: 'balanced',
    label: '均衡',
    hint: '错题、弱项、新题各占三成',
    wrong: 0.34,
    weak: 0.33,
    fresh: 0.33,
  );

  static const ExamWeightPreset wrongFocused = ExamWeightPreset(
    key: 'wrong',
    label: '重错题',
    hint: '一半是错过一次的题',
    wrong: 0.5,
    weak: 0.3,
    fresh: 0.2,
  );

  static const ExamWeightPreset weakFocused = ExamWeightPreset(
    key: 'weak',
    label: '补弱项',
    hint: '一半来自掌握度低的知识点',
    wrong: 0.25,
    weak: 0.5,
    fresh: 0.25,
  );

  static const ExamWeightPreset freshFocused = ExamWeightPreset(
    key: 'fresh',
    label: '多新题',
    hint: '六成是没做过的题',
    wrong: 0.2,
    weak: 0.2,
    fresh: 0.6,
  );

  static const List<ExamWeightPreset> presets = <ExamWeightPreset>[
    balanced,
    wrongFocused,
    weakFocused,
    freshFocused,
  ];

  /// 档位一句话摘要，例如「错题 50% · 弱项 30% · 新题 20%」。
  String get summary {
    String pct(double value) => '${(value * 100).round()}%';
    return '错题 ${pct(wrong)} · 弱项 ${pct(weak)} · 新题 ${pct(fresh)}';
  }
}

/// 把用户输入的考点拆成 tag 列表。
///
/// 接受中文/英文逗号、顿号、分号与换行；去空白、去空项、去重（保留输入顺序）。
List<String> parseExamTags(String raw) {
  final out = <String>[];
  for (final piece in raw.split(RegExp(r'[,，、;；\n]'))) {
    final tag = piece.trim();
    if (tag.isEmpty) continue;
    if (out.contains(tag)) continue;
    out.add(tag);
  }
  return out;
}
