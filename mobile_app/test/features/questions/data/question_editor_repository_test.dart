import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/questions/data/question_editor_repository.dart';

import '../../../support/recording_adapter.dart';

/// 建题/改题与草稿端点的**路径 + 动词 + 载荷**契约。
///
/// 守的理由与错题本测试相同：`Dio.baseUrl` 已经以 `/api` 结尾，仓库里多写
/// 一层 `/api` 会拼成 `/api/api/...`（404），而界面上只表现为「保存失败」。
/// 另外草稿的「删除单条」和「勾选确认」都走同一个 PATCH 端点，写错键名
/// （`delete` / `isConfirmed`）不会报错，只会让服务端静默忽略。
void main() {
  late RecordingAdapter adapter;
  late QuestionEditorRepository repository;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
      ..httpClientAdapter = adapter;
    repository = QuestionEditorRepository(dio);
  });

  const Map<String, dynamic> questionJson = <String, dynamic>{
    'id': 42,
    'content': '我国教育目的的理论基础是（ ）。',
    'options': <String>['A. 个人本位论', 'B. 社会本位论'],
    'type': 'single',
    'tags': <String>['教育目的'],
    'dimension': '教育学原理',
    'explanation': '教育目的受社会条件制约。',
    'answer': 'B',
    'material': '材料原文',
  };

  group('题目', () {
    test('fetchQuestion 打 GET /questions/{id} 并解析材料', () async {
      adapter.responseBody = questionJson;

      final question = await repository.fetchQuestion('42');

      final request = adapter.requests.single;
      expect(request.path, '/questions/42');
      expect(request.method, 'GET');
      expect(question.content, contains('教育目的'));
      expect(question.answer, 'B');
      expect(question.material, '材料原文');
    });

    test('createQuestion 是 POST /questions，载荷键名与表单一致', () async {
      adapter.responseBody = questionJson;

      final created = await repository.createQuestion(<String, dynamic>{
        'content': '题干',
        'options': <String>['甲', '乙'],
        'answer': 'A',
        'type': 'single',
        'tags': <String>['教育学'],
      });

      final request = adapter.requests.single;
      expect(request.path, '/questions');
      expect(request.method, 'POST');
      expect(request.data, <String, dynamic>{
        'content': '题干',
        'options': <String>['甲', '乙'],
        'answer': 'A',
        'type': 'single',
        'tags': <String>['教育学'],
      });
      expect(created?.id, '42');
    });

    test('createQuestion 服务端只回 {id} 时返回 null（不把成功当失败）', () async {
      adapter.responseBody = <String, dynamic>{'id': 7};

      final created = await repository.createQuestion(<String, dynamic>{
        'content': '题干',
      });

      expect(created, isNull);
    });

    test('createQuestion 服务端包一层 {question: ...} 也能解', () async {
      adapter.responseBody = <String, dynamic>{'question': questionJson};

      final created = await repository.createQuestion(<String, dynamic>{
        'content': '题干',
      });

      expect(created?.id, '42');
    });

    test('updateQuestion 是 PATCH /questions/{id}', () async {
      adapter.responseBody = <String, dynamic>{};

      await repository.updateQuestion('42', <String, dynamic>{
        'content': '新题干',
      });

      final request = adapter.requests.single;
      expect(request.path, '/questions/42');
      expect(request.method, 'PATCH');
      expect(request.data, <String, dynamic>{'content': '新题干'});
    });
  });

  group('草稿', () {
    test('listDrafts 打 GET /drafts，兼容 {items: []} 包装', () async {
      adapter.responseBody = <String, dynamic>{
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'd1',
            'status': 'ready',
            'itemCount': 3,
            'confirmedCount': 1,
          },
        ],
      };

      final drafts = await repository.listDrafts();

      expect(adapter.requests.single.path, '/drafts');
      expect(adapter.requests.single.method, 'GET');
      expect(drafts.single.id, 'd1');
      expect(drafts.single.itemCount, 3);
      expect(drafts.single.confirmedCount, 1);
    });

    test('fetchDraft 打 GET /drafts/{id}', () async {
      adapter.responseBody = <String, dynamic>{
        'id': 'd1',
        'status': 'ready',
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'idx': 0,
            'content': '题干',
            'options': <String>['甲', '乙'],
            'answer': 'A',
            'confirmed': 1,
          },
        ],
      };

      final draft = await repository.fetchDraft('d1');

      expect(adapter.requests.single.path, '/drafts/d1');
      expect(draft.status.wire, 'ready');
      expect(draft.items.single.options, <String>['甲', '乙']);
      expect(draft.confirmedCount, 1);
    });

    test('updateDraftItem 是 PATCH /drafts/{id}/items/{idx}', () async {
      adapter.responseBody = <String, dynamic>{
        'idx': 2,
        'content': '改过的题干',
        'confirmed': false,
      };

      final item = await repository.updateDraftItem('d1', 2, <String, dynamic>{
        'content': '改过的题干',
        'confirmed': false,
      });

      final request = adapter.requests.single;
      expect(request.path, '/drafts/d1/items/2');
      expect(request.method, 'PATCH');
      expect(request.data, <String, dynamic>{
        'content': '改过的题干',
        'confirmed': false,
      });
      expect(item?.content, '改过的题干');
    });

    test('deleteDraftItem 复用 PATCH，载荷为 {deleted: true}', () async {
      adapter.responseBody = <String, dynamic>{};

      await repository.deleteDraftItem('d1', 4);

      final request = adapter.requests.single;
      expect(request.path, '/drafts/d1/items/4');
      expect(request.method, 'PATCH');
      expect(request.data, <String, dynamic>{'deleted': true});
    });

    test('confirmDraft 是 POST /drafts/{id}/confirm，解析 created/skipped', () async {
      adapter.responseBody = <String, dynamic>{
        'created': 2,
        'skipped': 1,
        'conflicts': <String>['重复题干'],
      };

      final result = await repository.confirmDraft('d1');

      final request = adapter.requests.single;
      expect(request.path, '/drafts/d1/confirm');
      expect(request.method, 'POST');
      expect(result.created, 2);
      expect(result.skipped, 1);
      expect(result.conflicts, <String>['重复题干']);
    });

    test('analyzeDraft 是 POST /drafts/{id}/analyze', () async {
      adapter.responseBody = <String, dynamic>{
        'id': 'd1',
        'status': 'analyzing',
      };

      final draft = await repository.analyzeDraft('d1');

      final request = adapter.requests.single;
      expect(request.path, '/drafts/d1/analyze');
      expect(request.method, 'POST');
      expect(draft?.status.wire, 'analyzing');
    });

    test('discardDraft 是 DELETE /drafts/{id}', () async {
      adapter.responseBody = <String, dynamic>{'ok': true};

      await repository.discardDraft('d1');

      final request = adapter.requests.single;
      expect(request.path, '/drafts/d1');
      expect(request.method, 'DELETE');
    });
  });
}
