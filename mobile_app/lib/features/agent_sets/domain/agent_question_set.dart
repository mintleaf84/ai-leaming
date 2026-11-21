import 'agent_set_json.dart';

/// 一套「外部 Agent 推来的题」（`GET /agent-sets` 的列表项）。
///
/// 归属：接口是 JWT 口径，跨用户一律 404/空表，所以这里不持有 userId。
/// 这批题与题库是**同一张表 + 打标记**（契约 §2），因此这里只读「这批题的
/// 消费侧视角」：多少题、还剩几题没做、有没有没看过的。
class AgentQuestionSet {
  final int id;
  final String title;

  /// 来源工具（如 `claude-code`）；服务端没留痕时为 null。
  final String? agent;

  /// 生成这批题用的模型；仅留痕，界面只在详情里显示。
  final String? model;

  /// 它声称针对的考点（agent 提交时自报，未经验证）。
  final List<String> targetTags;

  /// 「为什么给你出这些」。
  final String? note;

  /// `active` / `archived` / `promoted`。
  final String status;

  /// 这批题的题目总数（**不含**已被标「有问题」移出的）。
  final int questionCount;

  /// 还没做过的题数。
  final int pendingCount;

  /// 没看过的题数（首页/列表角标用它）。
  final int unreadCount;

  /// 最近一次在这套题上的得分（0–1）。没有作答记录时为 null。
  final double? lastScore;

  final String? createdAt;

  const AgentQuestionSet({
    required this.id,
    required this.title,
    this.agent,
    this.model,
    this.targetTags = const <String>[],
    this.note,
    this.status = 'active',
    this.questionCount = 0,
    this.pendingCount = 0,
    this.unreadCount = 0,
    this.lastScore,
    this.createdAt,
  });

  /// 已经做过的题数。服务端没给时用「总数 − 未做」推，负数归零。
  int get doneCount {
    final done = questionCount - pendingCount;
    return done > 0 ? done : 0;
  }

  bool get isPromoted => status == 'promoted';
  bool get isArchived => status == 'archived';

  /// 这套题是否还有可做的题。
  bool get hasPending => pendingCount > 0;

  /// 列表卡右侧的主数值文案：说「还剩几题」，而不是「一共几题」——
  /// 用户关心的是自己还要花多少时间。
  String get pendingLabel {
    if (isPromoted) return '已转正';
    if (pendingCount > 0) return '剩 $pendingCount 题';
    if (questionCount > 0) return '已做完';
    return '暂无题目';
  }

  /// 来源行：`claude-code` / `未标注来源`，带模型时并排显示。
  String get sourceLabel {
    final name = (agent ?? '').trim();
    final modelName = (model ?? '').trim();
    if (name.isEmpty) return '未标注来源';
    if (modelName.isEmpty) return name;
    return '$name · $modelName';
  }

  /// 得分文案：契约里是 0–1，界面按百分比显示；没有记录时给 null（由调用方写
  /// 「还没做过」而不是编一个 0%）。
  String? get lastScoreLabel {
    final score = lastScore;
    if (score == null) return null;
    final percent = (score * 100).clamp(0, 100).toStringAsFixed(0);
    return '$percent%';
  }

  factory AgentQuestionSet.fromJson(Map<String, dynamic> json) {
    // `counts` 是契约里出现过的聚合壳（agent 侧列表用 counts/doneCount），
    // 消费侧很可能沿用同一套序列化，所以两处都认。
    final counts = readMap(json['counts']) ?? const <String, dynamic>{};
    final total = readInt(
      json['questionCount'] ??
          json['totalQuestions'] ??
          counts['total'] ??
          counts['questions'],
    );
    final done = readInt(
      json['doneCount'] ?? counts['done'] ?? counts['doneCount'],
    );
    final pendingRaw = readNullableInt(
      json['pendingCount'] ??
          json['unansweredCount'] ??
          json['remaining'] ??
          counts['pending'] ??
          counts['unanswered'],
    );
    // 「未做」缺失但给了已做数：用总数推。两者都缺时当作全部未做——
    // 显示「剩 0 题」会让用户以为这套题已经做完了。
    final pending =
        pendingRaw ?? (done > 0 ? (total - done).clamp(0, total) : total);
    final title = readString(json['title']).trim();
    return AgentQuestionSet(
      id: readInt(json['id'] ?? json['setId']),
      title: title.isEmpty ? 'AI 题集' : title,
      agent: _nullIfBlank(json['agent'] ?? json['source']),
      model: _nullIfBlank(json['model']),
      targetTags: readStringList(json['targetTags'] ?? json['target_tags']),
      note: _nullIfBlank(json['note']),
      status: readString(json['status'], fallback: 'active'),
      questionCount: total < 0 ? 0 : total,
      pendingCount: pending < 0 ? 0 : pending,
      unreadCount: readInt(
        json['unreadCount'] ?? json['unread'] ?? counts['unread'],
      ),
      lastScore: readNullableDouble(
        json['lastScore'] ?? json['bestScore'] ?? json['score'],
      ),
      createdAt: readNullableString(json['createdAt'] ?? json['created_at']),
    );
  }

  AgentQuestionSet copyWith({
    int? questionCount,
    int? pendingCount,
    int? unreadCount,
    double? lastScore,
    String? status,
  }) {
    return AgentQuestionSet(
      id: id,
      title: title,
      agent: agent,
      model: model,
      targetTags: targetTags,
      note: note,
      status: status ?? this.status,
      questionCount: questionCount ?? this.questionCount,
      pendingCount: pendingCount ?? this.pendingCount,
      unreadCount: unreadCount ?? this.unreadCount,
      lastScore: lastScore ?? this.lastScore,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'title': title,
    'agent': agent,
    'model': model,
    'targetTags': List<String>.from(targetTags),
    'note': note,
    'status': status,
    'questionCount': questionCount,
    'pendingCount': pendingCount,
    'unreadCount': unreadCount,
    'lastScore': lastScore,
    'createdAt': createdAt,
  };
}

/// 列表的一页。
///
/// 包装层认三种形状：`{data: [...]}`（现有列表接口的惯例）、`{items: [...]}`、
/// `{sets: [...]}`，以及裸数组（调用方用 [AgentSetPage.fromList]）。
class AgentSetPage {
  final List<AgentQuestionSet> sets;
  final int limit;
  final int offset;
  final int total;

  const AgentSetPage({
    this.sets = const <AgentQuestionSet>[],
    this.limit = 20,
    this.offset = 0,
    this.total = 0,
  });

  bool get isEmpty => sets.isEmpty;

  factory AgentSetPage.fromJson(Map<String, dynamic> json) {
    final meta = readMap(json['meta']) ?? const <String, dynamic>{};
    final rawList = json['data'] ?? json['sets'] ?? json['items'];
    final sets = readObjectList(rawList, AgentQuestionSet.fromJson);
    return AgentSetPage(
      sets: sets,
      limit: readInt(meta['limit'] ?? json['limit'], fallback: 20),
      offset: readInt(meta['offset'] ?? json['offset']),
      total: readInt(meta['total'] ?? json['total'], fallback: sets.length),
    );
  }

  factory AgentSetPage.fromList(List<dynamic> raw) {
    final sets = readObjectList(raw, AgentQuestionSet.fromJson);
    return AgentSetPage(sets: sets, total: sets.length);
  }
}

String? _nullIfBlank(Object? value) {
  final text = readString(value).trim();
  return text.isEmpty ? null : text;
}
