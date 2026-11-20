import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/exam/domain/exam_generate_rules.dart';
import 'package:mobile_app/features/exam/domain/exam_question.dart';

import '../../../support/fakes_exam.dart';

/// 用 Dio 的 `HttpClientAdapter` 桩住真实网络：断言的是**发出去的请求**
/// （路径、动词、载荷）与**客户端对响应的解析**，不是服务端实现。
///
/// 守的两条线：
/// 1. 路径必须是 `/exam/...`。`Dio.baseUrl` 已含 `/api`，写成 `/api/exam/...`
///    会变成 `/api/api/exam/...`，而界面上只表现为「加载失败」；
/// 2. 交卷载荷的字段名（`answers[].questionId/userAnswer/durationMs` 与 `clientKey`）
///    就是与判分服务的契约，改名不会有编译错误，只会静默丢分。
void main() {
  late ExamStubAdapter adapter;

  setUp(() {
    adapter = ExamStubAdapter((_) => examJson(const <String, dynamic>{}));
  });

  test('listPapers：GET /exam/papers，带 limit/offset，解析 data+meta', () async {
    adapter = ExamStubAdapter(
      (_) => examJson(
        examPaperPageJson(
          papers: <Map<String, dynamic>>[
            examPaperJson(id: 1, attemptCount: 2, bestScore: 0.8),
          ],
          total: 1,
          limit: 50,
        ),
      ),
    );
    final repository = examRepositoryWith(adapter);

    final page = await repository.listPapers(limit: 50, offset: 0);

    final request = adapter.gets.single;
    expect(request.path, '/exam/papers');
    expect(request.queryParameters, <String, dynamic>{
      'limit': 50,
      'offset': 0,
    });
    expect(page.papers.single.id, 1);
    expect(page.papers.single.attemptCount, 2);
    expect(page.total, 1);
  });

  test('createPaper：timed 带 durationMinutes，固定卷不带', () async {
    adapter = ExamStubAdapter((_) => examJson(examPaperDetailJson()));
    final repository = examRepositoryWith(adapter);

    await repository.createPaper(
      title: '手工卷',
      kind: 'timed',
      durationMinutes: 45,
      questionIds: <int>[3, 1, 3],
    );
    var body = adapter.posts.last.data! as Map<String, dynamic>;
    expect(adapter.posts.last.path, '/exam/papers');
    expect(body['title'], '手工卷');
    expect(body['kind'], 'timed');
    expect(body['durationMinutes'], 45);
    expect(body['questionIds'], <int>[3, 1, 3]);

    await repository.createPaper(
      title: '固定卷',
      kind: 'fixed',
      questionIds: <int>[2],
    );
    body = adapter.posts.last.data! as Map<String, dynamic>;
    expect(body.containsKey('durationMinutes'), isFalse);
  });

  test('getPaper / startAttempt：路径带 paperId', () async {
    adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/attempts')) {
        return examJson(
          examAttemptJson(
            sessionId: '77',
            deadlineAt: '2026-11-20T09:30:00.000Z',
          ),
        );
      }
      return examJson(examPaperDetailJson());
    });
    final repository = examRepositoryWith(adapter);

    final detail = await repository.getPaper(5);
    expect(adapter.gets.single.path, '/exam/papers/5');
    expect(detail.items, hasLength(2));

    final attempt = await repository.startAttempt(5);
    expect(adapter.posts.single.path, '/exam/papers/5/attempts');
    expect(attempt.sessionId, '77');
    expect(attempt.deadlineAt, isNotNull);
    expect(attempt.questions, hasLength(2));
  });

  test('generate：POST /exam/papers/generate，body 是规则快照', () async {
    adapter = ExamStubAdapter((_) => examJson(examPaperDetailJson()));
    final repository = examRepositoryWith(adapter);

    await repository.generate(
      const ExamGenerateRules(
        title: '模考',
        kind: 'timed',
        durationMinutes: 30,
        count: 10,
        tags: <String>['心理学'],
      ),
    );

    final request = adapter.posts.single;
    expect(request.path, '/exam/papers/generate');
    final body = request.data! as Map<String, dynamic>;
    expect(body['count'], 10);
    expect(body['tags'], <String>['心理学']);
    expect(body['weights'], isA<Map<String, dynamic>>());
  });

  test('getAttempt：sessionId 做 URL 编码', () async {
    adapter = ExamStubAdapter(
      (_) => examJson(examAttemptDetailJson(sessionId: 'a/b')),
    );
    final repository = examRepositoryWith(adapter);

    final detail = await repository.getAttempt('a/b');

    expect(adapter.gets.single.path, '/exam/attempts/a%2Fb');
    expect(detail.sessionId, 'a/b');
  });

  test('submit：载荷字段名与契约一致，clientKey 原样上送', () async {
    adapter = ExamStubAdapter(
      (_) => examJson(examSubmitResultJson(duplicate: true)),
    );
    final repository = examRepositoryWith(adapter);

    final result = await repository.submit(
      sessionId: '9',
      answers: const <ExamAnswerPayload>[
        ExamAnswerPayload(questionId: 1, userAnswer: 'A', durationMs: 3000),
        ExamAnswerPayload(questionId: 2, userAnswer: 'AB', durationMs: 4000),
      ],
      clientKey: 'key-abc',
    );

    final request = adapter.posts.single;
    expect(request.path, '/exam/attempts/9/submit');
    final body = request.data! as Map<String, dynamic>;
    expect(body['clientKey'], 'key-abc');
    final answers = body['answers']! as List<Map<String, dynamic>>;
    expect(answers, hasLength(2));
    expect(answers.first, <String, dynamic>{
      'questionId': 1,
      'userAnswer': 'A',
      'durationMs': 3000,
    });
    expect(result.duplicate, isTrue);
  });

  test('submitPayload：重放同一份 body（不改写、不加字段）', () async {
    adapter = ExamStubAdapter((_) => examJson(examSubmitResultJson()));
    final repository = examRepositoryWith(adapter);
    final payload = <String, dynamic>{
      'answers': <Map<String, dynamic>>[
        <String, dynamic>{'questionId': 1, 'userAnswer': 'A', 'durationMs': 1},
      ],
      'clientKey': 'frozen',
    };

    await repository.submitPayload('9', payload);
    await repository.submitPayload('9', payload);

    expect(adapter.posts, hasLength(2));
    expect(adapter.posts[1].data, same(payload));
  });

  test('响应不是 JSON 对象时抛 FormatException（不把 null 当数据渲染）', () async {
    adapter = ExamStubAdapter((_) => examJson(<Object>[1, 2, 3]));
    final repository = examRepositoryWith(adapter);

    expect(repository.listPapers(), throwsA(isA<FormatException>()));
  });
}
