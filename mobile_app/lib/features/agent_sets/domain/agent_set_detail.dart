import 'agent_question.dart';
import 'agent_question_set.dart';
import 'agent_set_json.dart';

/// 题集详情（`GET /agent-sets/{id}`，**不含答案**）。
///
/// 冻结形状（契约 §4.3）：`{set:{...}, questions:[{id,content,options,type,
/// dimension,tags,material}], flaggedCount}`。题目是**摊平对象**、顺序即批次内
/// 顺序，没有 `position` 也没有 `answer/explanation`；`flaggedCount` 是这批里
/// 已被标「有问题」移出的题数（不在 questions 里）。
///
/// 兼容：`{set, questions}`、把 set 字段摊平在根上、以及 `items:[{position,
/// question}]`（试卷形状）都认——多认一种包装只是为了让联调期的形状漂移不至于
/// 把整屏打黑。
class AgentSetDetail {
  final AgentQuestionSet set;
  final List<AgentQuestion> questions;

  /// 已被标「有问题」移出的题数（契约 §4.3 的 `flaggedCount`）。
  final int flaggedCount;

  const AgentSetDetail({
    required this.set,
    this.questions = const [],
    this.flaggedCount = 0,
  });

  bool get isEmpty => questions.isEmpty;

  /// 这套题还剩几道可做：优先用 set 的 `pendingCount`，它缺失时退化成题数。
  int get remainingCount {
    if (set.questionCount == 0) return questions.length;
    return set.pendingCount;
  }

  factory AgentSetDetail.fromJson(Map<String, dynamic> json) {
    final setJson = readMap(json['set']) ?? json;
    final rawQuestions =
        json['questions'] ?? json['items'] ?? setJson['questions'];
    final questions = <AgentQuestion>[];
    if (rawQuestions is List) {
      for (final item in rawQuestions) {
        final map = readMap(item);
        if (map == null) continue;
        // `{position, question}` 与「题目摊平」两种形状都认。
        final nested = readMap(map['question']);
        questions.add(AgentQuestion.fromJson(nested ?? map));
      }
    }
    final set = AgentQuestionSet.fromJson(setJson);
    final flaggedCount = readInt(
      json['flaggedCount'] ?? setJson['flaggedCount'],
    );
    return AgentSetDetail(
      // 详情页标题与「共 N 题」都靠它；服务端只回 questions 时用题数兜底，
      // 否则详情页会出现「0 题」而下面明明列着题。
      set: set.questionCount == 0 && questions.isNotEmpty
          ? set.copyWith(questionCount: questions.length)
          : set,
      questions: questions,
      flaggedCount: flaggedCount < 0 ? 0 : flaggedCount,
    );
  }

  AgentSetDetail copyWith({
    AgentQuestionSet? set,
    List<AgentQuestion>? questions,
    int? flaggedCount,
  }) {
    return AgentSetDetail(
      set: set ?? this.set,
      questions: questions ?? this.questions,
      flaggedCount: flaggedCount ?? this.flaggedCount,
    );
  }
}

/// 开始练习（`POST /agent-sets/{id}/attempts`）。
///
/// 服务端会建一场 `practice_sessions`（`practice_mode='agent_set'`）并把这一批
/// 可做的题回给客户端；逐题判分仍走 `POST /practice/session/{sessionId}/submit`。
class AgentSetAttempt {
  final String sessionId;
  final List<AgentQuestion> questions;

  const AgentSetAttempt({required this.sessionId, this.questions = const []});

  bool get hasSession => sessionId.trim().isNotEmpty;

  factory AgentSetAttempt.fromJson(Map<String, dynamic> json) {
    // sessionId 可能是数字（practice_sessions 的主键是整数），统一成字符串：
    // 路由与 submitted 接口都按字符串口径走。
    return AgentSetAttempt(
      sessionId: readString(json['sessionId'] ?? json['session_id']),
      questions: _readQuestions(json['questions']),
    );
  }
}

/// 「这题有问题」的结果（`POST /agent-sets/{id}/questions/{questionId}/flag`）。
///
/// 契约明确回「剩余题数」：界面据此在移除后提示「还剩 N 题」，而不是自己拿
/// 本地列表长度去猜（并发/历史批次会让两者不一致）。服务端没给时为 null，
/// 由调用方用本地列表长度兜底。
class AgentFlagResult {
  final int? remaining;
  final bool removed;

  const AgentFlagResult({this.remaining, this.removed = true});

  factory AgentFlagResult.fromJson(Map<String, dynamic> json) {
    final counts = readMap(json['counts']) ?? const <String, dynamic>{};
    return AgentFlagResult(
      remaining: readNullableInt(
        json['remaining'] ??
            json['remainingCount'] ??
            json['remainingQuestions'] ??
            counts['remaining'] ??
            json['pendingCount'],
      ),
      removed: readBool(json['removed'] ?? json['flagged'], fallback: true),
    );
  }
}

/// 「转正入库」的结果（`POST /agent-sets/{id}/promote`）。
class AgentPromoteResult {
  final bool promoted;

  /// 转正后进入题库的题数（服务端没给时为 null）。
  final int? questionCount;

  const AgentPromoteResult({required this.promoted, this.questionCount});

  factory AgentPromoteResult.fromJson(Map<String, dynamic> json) {
    final setJson = readMap(json['set']);
    final promoted = readBool(
      json['promoted'] ?? json['ok'] ?? setJson?['status'] == 'promoted',
      fallback: false,
    );
    return AgentPromoteResult(
      promoted: promoted,
      questionCount: readNullableInt(
        json['questionCount'] ??
            json['promotedCount'] ??
            json['count'] ??
            setJson?['questionCount'],
      ),
    );
  }
}

/// 「一键成卷」的结果（`POST /agent-sets/{id}/paper`）。
///
/// 冻结形状（§4.3）：与试卷详情同形 `{paper, items, lastAttempt}`。这里只取
/// 「跳到试卷预览」需要的三项；`items` 只在 `paper.totalQuestions` 缺失时用来
/// 兜底题数，其余字段交给试卷 feature 自己再拉一次。
class AgentSetPaper {
  final int paperId;
  final String title;
  final int totalQuestions;

  const AgentSetPaper({
    required this.paperId,
    this.title = 'AI 题集成卷',
    this.totalQuestions = 0,
  });

  factory AgentSetPaper.fromJson(Map<String, dynamic> json) {
    final paper = readMap(json['paper']) ?? json;
    final rawItems = json['items'];
    final itemsCount = rawItems is List ? rawItems.length : 0;
    final title = readString(paper['title']).trim();
    final total = readInt(
      paper['totalQuestions'] ?? paper['questionCount'] ?? paper['total'],
    );
    return AgentSetPaper(
      paperId: readInt(paper['id'] ?? json['paperId']),
      title: title.isEmpty ? 'AI 题集成卷' : title,
      totalQuestions: total > 0 ? total : itemsCount,
    );
  }
}

List<AgentQuestion> _readQuestions(Object? value) {
  if (value is! List) return const <AgentQuestion>[];
  final out = <AgentQuestion>[];
  for (final item in value) {
    final map = readMap(item);
    if (map == null) continue;
    final nested = readMap(map['question']);
    out.add(AgentQuestion.fromJson(nested ?? map));
  }
  return out;
}
