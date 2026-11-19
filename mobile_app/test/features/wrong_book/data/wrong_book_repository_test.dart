import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/wrong_book/data/wrong_book_repository.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是错题本的「路径契约」和「响应解析」两条线：
///
/// 1. **路径不得多一层 `/api`**：`Dio.baseUrl` 已经带了 `/api`，仓库里写
///    `/api/wrong-book` 会拼成 `/api/api/wrong-book`（404），而界面上只表现为
///    「错题本加载失败」——用真实后端排查要绕很大一圈。所以这里逐个断言
///    `RequestOptions.path` 的精确值。
/// 2. **动词不能错**：`markAsMastered` 是 POST、`unmarkMastered` 是 DELETE，
///    同一个路径。写反了不会报错，只会让「取消掌握」变成「再标一次」。
/// 3. **载荷键名**：批量练习必须是 `{questionIds: [...]}`（服务端按这个键取），
///    拼成 `ids` 之类的会静默出一套空题。
/// 4. **列表响应真能 fromJson**：用最小但真实的 JSON 样例（不是 `{}`），
///    这样字段改名/类型变化会在测试里暴露，而不是等到用户点开错题本。
void main() {
  late RecordingAdapter adapter;
  late WrongBookRepository repository;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    repository = WrongBookRepository(dio);
  });

  const Map<String, dynamic> wrongQuestionJson = <String, dynamic>{
    'questionId': 42,
    'questionContent': '我国教育目的的理论基础是（ ）。',
    'tags': <String>['教育目的', '教育学原理'],
    'wrongCount': 3,
    'lastWrongAt': '2026-11-18T10:00:00.000Z',
    'correctAnswer': 'A',
    'userLastAnswer': 'B',
  };

  group('路径与动词', () {
    test('getWrongQuestions 打 /wrong-book（不是 /api/wrong-book）', () async {
      adapter.responseBody = <Map<String, dynamic>>[wrongQuestionJson];

      final list = await repository.getWrongQuestions();

      final request = adapter.requests.single;
      expect(request.path, '/wrong-book');
      expect(request.method, 'GET');
      expect(list.single.questionId, '42');
    });

    test('getWrongQuestionsByTag 打 /wrong-book/by-tag', () async {
      adapter.responseBody = <Map<String, dynamic>>[
        <String, dynamic>{
          'tag': '教育目的',
          'count': 1,
          'questions': <Map<String, dynamic>>[wrongQuestionJson],
        },
      ];

      final groups = await repository.getWrongQuestionsByTag();

      final request = adapter.requests.single;
      expect(request.path, '/wrong-book/by-tag');
      expect(request.method, 'GET');
      expect(groups.single.tag, '教育目的');
    });

    test('getStats 打 /wrong-book/stats', () async {
      adapter.responseBody = <String, dynamic>{
        'total': 12,
        'recent': 3,
        'frequent': 2,
      };

      final stats = await repository.getStats();

      expect(adapter.requests.single.path, '/wrong-book/stats');
      expect(adapter.requests.single.method, 'GET');
      expect(stats.total, 12);
    });

    test('getDetail 打 /wrong-book/{id}', () async {
      adapter.responseBody = <String, dynamic>{
        'questionId': 42,
        'questionContent': '我国教育目的的理论基础是（ ）。',
        'options': <String>['A. 个人本位论', 'B. 社会本位论'],
        'correctAnswer': 'A',
        'explanation': '教育目的受社会条件制约。',
        'tags': <String>['教育目的'],
        'questionType': 'single',
        'wrongCount': 3,
        'lastWrongAt': '2026-11-18T10:00:00.000Z',
        'userLastAnswer': 'B',
        'historyLogs': <Map<String, dynamic>>[
          <String, dynamic>{
            'timestamp': '2026-11-18T10:00:00.000Z',
            'userAnswer': 'B',
            'isCorrect': false,
          },
        ],
      };

      final detail = await repository.getDetail('42');

      expect(adapter.requests.single.path, '/wrong-book/42');
      expect(adapter.requests.single.method, 'GET');
      expect(detail.questionId, '42');
    });

    test(
      'createPractice 是 POST /wrong-book/practice，载荷键为 questionIds',
      () async {
        adapter.responseBody = <String, dynamic>{
          'sessionId': 'agent_9',
          'questions': <Object?>[],
        };

        final result = await repository.createPractice(<String>['1', '2']);

        final request = adapter.requests.single;
        expect(request.path, '/wrong-book/practice');
        expect(request.method, 'POST');
        expect(request.data, <String, dynamic>{
          'questionIds': <String>['1', '2'],
        });
        expect(result['sessionId'], 'agent_9');
      },
    );

    test('markAsMastered 是 POST /wrong-book/{id}/master', () async {
      adapter.responseBody = <String, dynamic>{'ok': true};

      await repository.markAsMastered('42');

      final request = adapter.requests.single;
      expect(request.path, '/wrong-book/42/master');
      expect(request.method, 'POST');
    });

    test('unmarkMastered 是 DELETE /wrong-book/{id}/master（同一个路径）', () async {
      adapter.responseBody = <String, dynamic>{'ok': true};

      await repository.unmarkMastered('42');

      final request = adapter.requests.single;
      expect(request.path, '/wrong-book/42/master');
      expect(request.method, 'DELETE');
    });
  });

  group('响应解析：字段真的落到模型上', () {
    test('WrongQuestion.fromJson 保留 id 字符串化、标签与作答记录', () async {
      adapter.responseBody = <Map<String, dynamic>>[wrongQuestionJson];

      final item = (await repository.getWrongQuestions()).single;

      expect(item.questionId, '42', reason: '后端给数字 id，界面按字符串用');
      expect(item.questionContent, contains('教育目的'));
      expect(item.tags, <String>['教育目的', '教育学原理']);
      expect(item.wrongCount, 3);
      expect(item.lastWrongAt, '2026-11-18T10:00:00.000Z');
      expect(item.correctAnswer, 'A');
      expect(item.userLastAnswer, 'B');
    });

    test('WrongQuestionsByTag.fromJson 带回组内题目', () async {
      adapter.responseBody = <Map<String, dynamic>>[
        <String, dynamic>{
          'tag': '教育目的',
          'count': 1,
          'questions': <Map<String, dynamic>>[wrongQuestionJson],
        },
      ];

      final group = (await repository.getWrongQuestionsByTag()).single;

      expect(group.count, 1);
      expect(group.questions.single.questionId, '42');
    });

    test('WrongQuestionDetail.fromJson 解析选项与历史作答', () async {
      adapter.responseBody = <String, dynamic>{
        'questionId': 42,
        'questionContent': '题干',
        'options': <String>['A. 甲', 'B. 乙'],
        'correctAnswer': 'A',
        'explanation': '解析',
        'tags': <String>['教育目的'],
        'questionType': 'single',
        'wrongCount': 2,
        'lastWrongAt': '2026-11-18T10:00:00.000Z',
        'userLastAnswer': 'B',
        'historyLogs': <Map<String, dynamic>>[
          <String, dynamic>{
            'timestamp': '2026-11-18T10:00:00.000Z',
            'userAnswer': 'B',
            'isCorrect': false,
          },
        ],
      };

      final detail = await repository.getDetail('42');

      expect(detail.options, <String>['A. 甲', 'B. 乙']);
      expect(detail.questionType, 'single');
      expect(detail.historyLogs.single.userAnswer, 'B');
      expect(detail.historyLogs.single.isCorrect, isFalse);
    });
  });
}
