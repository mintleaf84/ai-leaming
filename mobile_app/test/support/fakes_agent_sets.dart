import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/agent_sets/data/agent_sets_repository.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_notifier.dart';

import 'fake_preferences_store.dart';
import 'fake_providers.dart';

/// AI 题集相关测试的共享假物。
///
/// 为什么单独一个文件而不是往 `fake_providers.dart` 里塞：那份文件被十几个
/// 既有用例 import，往里面加题集专用的构造器会让每次改题集测试都牵动别人的
/// 编译单元；lane 约定也要求新 fake 放新文件。
class AgentSetsStubAdapter implements HttpClientAdapter {
  AgentSetsStubAdapter(this.handler);

  final FutureOr<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  List<RequestOptions> get gets => requests
      .where((request) => request.method == 'GET')
      .toList(growable: false);

  List<RequestOptions> get posts => requests
      .where((request) => request.method == 'POST')
      .toList(growable: false);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody agentSetsJson(Object? body, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: const <String, List<String>>{
      Headers.contentTypeHeader: <String>['application/json; charset=utf-8'],
    },
  );
}

/// 用桩 adapter 造一个指向 `/api` 的仓库（baseUrl 口径与生产一致）。
AgentSetsRepository agentSetsRepositoryWith(AgentSetsStubAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
    ..httpClientAdapter = adapter;
  return AgentSetsRepository(dio);
}

/// 记录型通知出口：断言「发了几条、内容是什么、送达与否」。
class FakeAgentSetNotifier implements AgentSetNotifier {
  FakeAgentSetNotifier({this.delivered = true});

  /// 是否声称送达（false 用来验证「没送达就不推进去重游标」）。
  bool delivered;

  final List<({String title, String body})> sent =
      <({String title, String body})>[];

  @override
  Future<bool> showNewSets({
    required String title,
    required String body,
  }) async {
    sent.add((title: title, body: body));
    return delivered;
  }
}

/// 记录 sessionId 的练习仓库替身。
///
/// 复用 `FakePracticeRepository`（判分响应/失败注入都在那边配好了），只补一个
/// 字段：**判分打到哪一场会话**。`POST /agent-sets/{id}/attempts` 回来的
/// sessionId 丢了的话，判分会打到不存在的会话上，而这在界面上只表现为
/// 「提交失败」——所以值得钉住。
class RecordingPracticeRepository extends FakePracticeRepository {
  final List<String> submittedSessionIds = <String>[];

  @override
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
    String? mode,
  }) {
    submittedSessionIds.add(sessionId);
    return super.submitAnswer(
      sessionId: sessionId,
      questionId: questionId,
      userAnswer: userAnswer,
      duration: duration,
      sessionQuestionIds: sessionQuestionIds,
      mode: mode,
    );
  }
}

// ---------------------------------------------------------------------------
// JSON 构造器（形状对齐契约 §4.2；服务端由另一条 lane 并行实现）
// ---------------------------------------------------------------------------

Map<String, dynamic> agentSetJson({
  int id = 1,
  String title = '教综 · 教育目的专项',
  String? agent = 'claude-code',
  String? model = 'claude-sonnet',
  Object? targetTags = const <String>['教育学', '教育目的'],
  int questionCount = 3,
  int pendingCount = 2,
  int unreadCount = 0,
  double? lastScore,
  String? createdAt,
}) {
  return <String, dynamic>{
    'id': id,
    'title': title,
    'agent': agent,
    'model': model,
    'targetTags': targetTags,
    'questionCount': questionCount,
    'pendingCount': pendingCount,
    'unreadCount': unreadCount,
    'lastScore': lastScore,
    'createdAt': createdAt ?? '2026-11-21T08:00:00.000Z',
  };
}

Map<String, dynamic> agentSetPageJson({
  List<Map<String, dynamic>>? sets,
  int? total,
  int limit = 50,
  int offset = 0,
}) {
  final list = sets ?? <Map<String, dynamic>>[agentSetJson()];
  return <String, dynamic>{
    'data': list,
    'meta': <String, dynamic>{
      'limit': limit,
      'offset': offset,
      'total': total ?? list.length,
    },
  };
}

Map<String, dynamic> agentQuestionJson({
  int id = 1,
  String type = 'single',
  String content = '教育目的的核心是什么？',
  List<String> options = const <String>['培养人', '传授知识', '选拔人才', '服务社会'],
  List<String> tags = const <String>['教育学'],
  String? material,
}) {
  return <String, dynamic>{
    'id': id,
    'content': content,
    'options': options,
    'type': type,
    'dimension': 'knowledge',
    'tags': tags,
    'material': material,
  };
}

Map<String, dynamic> agentSetDetailJson({
  Map<String, dynamic>? set,
  List<Map<String, dynamic>>? questions,
  int flaggedCount = 0,
}) {
  final list =
      questions ??
      <Map<String, dynamic>>[
        agentQuestionJson(id: 11),
        agentQuestionJson(id: 12, type: 'multi'),
      ];
  return <String, dynamic>{
    'set':
        set ??
        agentSetJson(questionCount: list.length, pendingCount: list.length),
    'questions': list,
    'flaggedCount': flaggedCount,
  };
}

Map<String, dynamic> agentSetAttemptJson({
  String sessionId = '901',
  List<Map<String, dynamic>>? questions,
}) {
  return <String, dynamic>{
    'sessionId': sessionId,
    'questions':
        questions ??
        <Map<String, dynamic>>[
          agentQuestionJson(id: 11),
          agentQuestionJson(id: 12, type: 'multi'),
        ],
  };
}

/// 冻结形状：`{questionId, flagged:true, remaining}`（契约 §4.3）。
Map<String, dynamic> agentFlagJson({
  int questionId = 11,
  int remaining = 1,
  bool flagged = true,
}) {
  return <String, dynamic>{
    'questionId': questionId,
    'flagged': flagged,
    'remaining': remaining,
  };
}

/// 冻结形状：`{setId, promoted:true, promotedCount}`（契约 §4.3）。
Map<String, dynamic> agentPromoteJson({
  int setId = 12,
  bool promoted = true,
  int? promotedCount = 2,
}) {
  return <String, dynamic>{
    'setId': setId,
    'promoted': promoted,
    'promotedCount': promotedCount,
  };
}

/// 冻结形状：与试卷详情同形 `{paper, items, lastAttempt}`（契约 §4.3）。
Map<String, dynamic> agentPaperJson({
  int id = 77,
  String title = 'AI 题集成卷',
  int totalQuestions = 2,
  bool withItems = true,
}) {
  return <String, dynamic>{
    'paper': <String, dynamic>{
      'id': id,
      'title': title,
      'kind': 'fixed',
      'source': 'agent',
      // totalQuestions 故意放在 items 之外：成卷接口允许只回 items，
      // 客户端要用 items 长度兜底（见 AgentSetPaper.fromJson）。
      if (totalQuestions > 0) 'totalQuestions': totalQuestions,
    },
    if (withItems)
      'items': <Map<String, dynamic>>[
        for (var index = 0; index < totalQuestions; index++)
          <String, dynamic>{
            'position': index + 1,
            'question': agentQuestionJson(id: 100 + index),
          },
      ],
    'lastAttempt': null,
  };
}

Map<String, dynamic> agentJudgeJson({
  bool isCorrect = true,
  String correctAnswer = 'A',
  bool offline = false,
}) {
  return <String, dynamic>{
    'isCorrect': isCorrect,
    'correctAnswer': correctAnswer,
    if (offline) 'offline': true,
  };
}

// ---------------------------------------------------------------------------
// Provider 覆盖
// ---------------------------------------------------------------------------

/// 题集仓库（真 Dio + 桩 adapter）。
List<Object> fakeAgentSets(AgentSetsStubAdapter adapter) {
  return <Object>[
    agentSetsRepositoryProvider.overrideWithValue(
      agentSetsRepositoryWith(adapter),
    ),
  ];
}

/// 通知出口 + 偏好存储：未读通知相关用例一次配齐。
List<Object> fakeAgentSetNotify({
  FakeAgentSetNotifier? notifier,
  FakePreferencesStore? store,
  Map<String, String>? seen,
}) {
  return <Object>[
    agentSetNotifierProvider.overrideWithValue(
      notifier ?? FakeAgentSetNotifier(),
    ),
    preferencesStoreProvider.overrideWithValue(
      store ?? FakePreferencesStore(initial: seen),
    ),
  ];
}
