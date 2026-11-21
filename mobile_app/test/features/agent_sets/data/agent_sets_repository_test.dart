import 'package:flutter_test/flutter_test.dart';

import '../../../support/fakes_agent_sets.dart';

/// 用 Dio 的 `HttpClientAdapter` 桩住真实网络：断言的是**发出去的请求**
/// （路径、动词、载荷）与**客户端对响应的解析**，不是服务端实现。
///
/// 守的两条线：
/// 1. 路径必须是 `/agent-sets/...`。`Dio.baseUrl` 已含 `/api`，写成
///    `/api/agent-sets/...` 会变成 `/api/api/agent-sets/...`，界面上只表现为
///    「加载失败」；
/// 2. 报错载荷的字段名（`reason`）与「没填原因就不发这个字段」的口径，
///    是 Agent 侧修正下一批题的依据。
void main() {
  setUp(() {});

  test('list：GET /agent-sets，带 limit/offset，解析 data+meta', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[
            agentSetJson(id: 1, pendingCount: 2, unreadCount: 3),
          ],
          total: 1,
          limit: 50,
        ),
      ),
    );
    final page = await agentSetsRepositoryWith(adapter).list(limit: 50);

    final request = adapter.gets.single;
    expect(request.path, '/agent-sets');
    expect(request.queryParameters, <String, dynamic>{
      'limit': 50,
      'offset': 0,
    });
    expect(page.sets.single.id, 1);
    expect(page.sets.single.unreadCount, 3);
    expect(page.total, 1);
  });

  test('list：裸数组也解析（服务端忽略分页包装时）', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(<Map<String, dynamic>>[
        agentSetJson(id: 5, title: '裸数组'),
      ]),
    );
    final page = await agentSetsRepositoryWith(adapter).list();

    expect(page.sets.single.title, '裸数组');
    expect(page.total, 1);
  });

  test('list：响应不是对象也不是数组 → FormatException（不静默成空列表）', () async {
    final adapter = AgentSetsStubAdapter((_) => agentSetsJson('oops'));

    await expectLater(
      agentSetsRepositoryWith(adapter).list(),
      throwsA(isA<FormatException>()),
    );
  });

  test('getSet：GET /agent-sets/{id}', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(agentSetDetailJson()),
    );
    final detail = await agentSetsRepositoryWith(adapter).getSet(12);

    expect(adapter.gets.single.path, '/agent-sets/12');
    expect(detail.questions, hasLength(2));
  });

  test('startAttempt：POST /agent-sets/{id}/attempts，解析会话与题目', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(agentSetAttemptJson(sessionId: '901')),
    );
    final attempt = await agentSetsRepositoryWith(adapter).startAttempt(12);
    expect(adapter.posts.single.path, '/agent-sets/12/attempts');
    expect(attempt.sessionId, '901');
    expect(attempt.questions.first.id, 11);
    expect(attempt.questions, hasLength(2));
  });

  test('flagQuestion：带 reason 时发字段，路径含题号', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(agentFlagJson(remaining: 1)),
    );
    final result = await agentSetsRepositoryWith(
      adapter,
    ).flagQuestion(12, 11, reason: '  答案有误  ');

    final request = adapter.posts.single;
    expect(request.path, '/agent-sets/12/questions/11/flag');
    // 前后空白去掉：理由会原样给 Agent 看
    expect(request.data, <String, dynamic>{'reason': '答案有误'});
    expect(result.remaining, 1);
  });

  test('flagQuestion：没填原因时不发 reason 字段', () async {
    final adapter = AgentSetsStubAdapter((_) => agentSetsJson(agentFlagJson()));
    await agentSetsRepositoryWith(adapter).flagQuestion(12, 11, reason: '   ');

    expect(adapter.posts.single.data, <String, dynamic>{});
  });

  test('promote / createPaper：POST 到对应子路径', () async {
    final adapter = AgentSetsStubAdapter((options) {
      if (options.path.endsWith('/promote')) {
        return agentSetsJson(agentPromoteJson(promotedCount: 3));
      }
      return agentSetsJson(agentPaperJson(id: 77));
    });
    final repository = agentSetsRepositoryWith(adapter);

    final promoted = await repository.promote(12);
    final paper = await repository.createPaper(12);

    expect(adapter.posts[0].path, '/agent-sets/12/promote');
    expect(adapter.posts[1].path, '/agent-sets/12/paper');
    expect(promoted.promoted, isTrue);
    // 冻结形状用 promotedCount，模型统一暴露成 questionCount
    expect(promoted.questionCount, 3);
    expect(paper.paperId, 77);
  });

  test('非对象响应（HTML/代理页）→ FormatException 带上路径', () async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(<dynamic>[1, 2, 3]),
    );

    await expectLater(
      agentSetsRepositoryWith(adapter).getSet(1),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          contains('GET /agent-sets/{id}'),
        ),
      ),
    );
  });
}
