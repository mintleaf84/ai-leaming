import 'exam_json.dart';
import 'exam_question.dart';

/// 一张试卷（`GET /papers` 的列表项与 `GET /papers/{id}` 的 `paper`）。
///
/// 归属用户：跨用户一律 404，所以这里不重复持有 userId。
class ExamPaper {
  final int id;
  final String title;

  /// `fixed`（固定题量，不限时）/ `timed`（限时）。
  final String kind;

  /// 限时分钟数；`kind == fixed` 时为 null。
  final int? durationMinutes;

  /// `manual`（手工组卷）/ `auto`（自动组卷）。
  final String source;
  final int totalQuestions;

  /// 这张卷子已经作答过几次（列表页右侧展示）。
  final int attemptCount;

  /// 最好成绩。服务端口径是 0–1 的分数，展示前用 `examScorePercent` 归一。
  final double? bestScore;

  /// 最近一次作答时间（ISO 字符串，原样保留；解析交给展示层）。
  final String? lastAttemptAt;

  const ExamPaper({
    required this.id,
    required this.title,
    required this.kind,
    this.durationMinutes,
    this.source = 'manual',
    this.totalQuestions = 0,
    this.attemptCount = 0,
    this.bestScore,
    this.lastAttemptAt,
  });

  bool get isTimed => kind == 'timed' && durationMinutes != null;

  /// 列表页/预览页的时限文案。
  String get durationLabel => isTimed ? '限时 ${durationMinutes!} 分钟' : '不限时';

  factory ExamPaper.fromJson(Map<String, dynamic> json) {
    final kind = readString(json['kind'], fallback: 'fixed');
    final minutes = readNullableInt(json['durationMinutes']);
    final title = readString(json['title']).trim();
    return ExamPaper(
      id: readInt(json['id']),
      // 空标题按「未命名」处理：列表与预览页都要有可点/可读的标题，
      // 空串在卡片上等于一张没有名字的卷子。
      title: title.isEmpty ? '未命名试卷' : title,
      kind: kind,
      // `fixed` 卷契约上强制 durationMinutes 为 NULL：即使服务端回了一个值，
      // 也不能让界面显示成「限时」，否则列表与作答屏的计时口径会打架。
      durationMinutes: kind == 'timed' ? minutes : null,
      source: readString(json['source'], fallback: 'manual'),
      totalQuestions: readInt(json['totalQuestions']),
      attemptCount: readInt(json['attemptCount']),
      bestScore: readNullableDouble(json['bestScore']),
      lastAttemptAt: readNullableString(json['lastAttemptAt']),
    );
  }

  ExamPaper copyWith({int? totalQuestions, int? attemptCount}) {
    return ExamPaper(
      id: id,
      title: title,
      kind: kind,
      durationMinutes: durationMinutes,
      source: source,
      totalQuestions: totalQuestions ?? this.totalQuestions,
      attemptCount: attemptCount ?? this.attemptCount,
      bestScore: bestScore,
      lastAttemptAt: lastAttemptAt,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'title': title,
    'kind': kind,
    'durationMinutes': durationMinutes,
    'source': source,
    'totalQuestions': totalQuestions,
    'attemptCount': attemptCount,
    'bestScore': bestScore,
    'lastAttemptAt': lastAttemptAt,
  };
}

/// 试卷中的一项：题号（从 1 开始）与题目。
class ExamPaperItem {
  final int position;
  final ExamQuestion question;

  const ExamPaperItem({required this.position, required this.question});

  factory ExamPaperItem.fromJson(Map<String, dynamic> json) {
    // 契约形状是 `{position, question}`；服务端若把题目摊平在 item 上
    // （旧版本快照/手写 mock），也接受——预览清单只读题面，不需要额外信息。
    final nested = readMap(json['question']);
    return ExamPaperItem(
      position: readInt(json['position']),
      question: ExamQuestion.fromJson(nested ?? json),
    );
  }
}

/// 最近一次作答的摘要（`GET /papers/{id}` 的 `lastAttempt`）。
///
/// 契约只写了「有就带」，没有给字段。这里只取展示需要的三项，其余忽略：
/// 多读字段等于给未来版本制造耦合。
class ExamLastAttempt {
  final String? sessionId;
  final double? score;
  final String? submittedAt;

  const ExamLastAttempt({this.sessionId, this.score, this.submittedAt});

  static ExamLastAttempt? fromJsonOrNull(Object? value) {
    final json = readMap(value);
    if (json == null) return null;
    return ExamLastAttempt(
      sessionId: readNullableString(json['sessionId']),
      score: readNullableDouble(json['score']),
      submittedAt:
          readNullableString(
            json['submittedAt'] ?? json['examSubmittedAt'] ?? json['createdAt'],
          ) ??
          readNullableString(json['submitted_at']),
    );
  }
}

/// 试卷详情（`GET /papers/{id}`）。
class ExamPaperDetail {
  final ExamPaper paper;
  final List<ExamPaperItem> items;
  final ExamLastAttempt? lastAttempt;

  const ExamPaperDetail({
    required this.paper,
    this.items = const [],
    this.lastAttempt,
  });

  factory ExamPaperDetail.fromJson(Map<String, dynamic> json) {
    final paperJson = readMap(json['paper']) ?? json;
    final items = readObjectList(
      json['items'] ?? paperJson['items'],
      ExamPaperItem.fromJson,
    );
    final paper = ExamPaper.fromJson(paperJson);
    return ExamPaperDetail(
      // `totalQuestions` 缺失时用 items 长度兜底：预览页要显示「共 N 题」，
      // 显示 0 题会让用户以为卷子是空的。
      paper: paper.totalQuestions == 0 && items.isNotEmpty
          ? paper.copyWith(totalQuestions: items.length)
          : paper,
      items: items,
      lastAttempt: ExamLastAttempt.fromJsonOrNull(
        json['lastAttempt'] ?? json['last_attempt'],
      ),
    );
  }

  ExamPaperDetail copyWith({ExamLastAttempt? lastAttempt}) {
    return ExamPaperDetail(
      paper: paper,
      items: items,
      lastAttempt: lastAttempt ?? this.lastAttempt,
    );
  }
}

/// 试卷列表的一页。
class ExamPaperPage {
  final List<ExamPaper> papers;
  final int limit;
  final int offset;
  final int total;

  const ExamPaperPage({
    this.papers = const [],
    this.limit = 20,
    this.offset = 0,
    this.total = 0,
  });

  factory ExamPaperPage.fromJson(Map<String, dynamic> json) {
    final meta = readMap(json['meta']) ?? const <String, dynamic>{};
    // 列表可能包在 `data`（回忆/练习接口的惯例）或 `papers` 里；
    // 两种都认，避免服务端换个包装就让整屏空掉。
    final rawList = json['data'] ?? json['papers'] ?? json['items'];
    final papers = readObjectList(rawList, ExamPaper.fromJson);
    return ExamPaperPage(
      papers: papers,
      limit: readInt(meta['limit'] ?? json['limit'], fallback: 20),
      offset: readInt(meta['offset'] ?? json['offset']),
      total: readInt(meta['total'] ?? json['total'], fallback: papers.length),
    );
  }
}
