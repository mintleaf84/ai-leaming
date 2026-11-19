import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/knowledge/presentation/knowledge_provider.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是知识卡片列表的**请求契约**和**失败可见性**：
///
/// 1. **查询参数**：列表固定 `limit=100`；按分类筛时 `category` 必须带上，
///    不带分类时不能发一个空的 `category=`（后端会当成「分类名是空串」而查空）。
/// 2. **失败不能静默成功**：任何解析/网络失败都要落到 `error` 上；响应缺
///    `cards` 字段也算失败——用 `[] ?? []` 兜底只会让界面永远显示「没有卡片」。
/// 3. **失败不抹掉已上屏数据**，重试成功则清掉 error。
/// 4. **创建后刷新**：`createCard` 先 POST 载荷、成功后重新拉列表；失败必须
///    把异常抛给调用方（界面要提示），不能吞掉。
/// 5. **竞态**：请求序号防护——先发后到的旧结果必须被丢弃，列表永远由最新
///    发出的那次请求决定。
void main() {
  late RecordingAdapter adapter;

  setUp(() {
    adapter = RecordingAdapter();
  });

  Dio makeDio() =>
      Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
        ..httpClientAdapter = adapter;

  ProviderContainer makeContainer() {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [dioProvider.overrideWithValue(makeDio())],
    );
    addTearDown(container.dispose);
    return container;
  }

  Map<String, dynamic> cardJson(int id) => <String, dynamic>{
    'id': id,
    'title': '卡片 $id',
    'category': '教育学',
    'tags': ['教育目的'],
    'front': '正面',
    'back': '背面',
    'key_points': [
      {'term': '教育目的', 'definition': '培养人的总要求'},
    ],
    'created_at': '2026-11-18',
  };

  Map<String, dynamic> listJson(List<int> ids) => <String, dynamic>{
    'cards': ids.map(cardJson).toList(),
    'categories': ['教育学', '心理学'],
  };

  group('初始状态', () {
    test('无卡片、无分类、非加载中、无错误，且不发请求', () {
      final container = makeContainer();

      final state = container.read(knowledgeControllerProvider);

      expect(state.cards, isEmpty);
      expect(state.categories, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty);
    });
  });

  group('loadCards 请求契约', () {
    test('不带分类时打 /knowledge/cards?limit=100，且不塞空 category', () async {
      adapter.responseBody = listJson([1, 2]);
      final container = makeContainer();

      await container.read(knowledgeControllerProvider.notifier).loadCards();

      final request = adapter.requests.single;
      expect(request.path, '/knowledge/cards');
      expect(request.method, 'GET');
      expect(request.queryParameters['limit'], 100);
      expect(
        request.queryParameters.containsKey('category'),
        isFalse,
        reason: 'category= 空串会被后端当成「分类名为空」而查不到数据',
      );
    });

    test('带分类时 category 原样进 query', () async {
      adapter.responseBody = listJson([1]);
      final container = makeContainer();

      await container
          .read(knowledgeControllerProvider.notifier)
          .loadCards(category: '教育学');

      expect(adapter.requests.single.queryParameters['category'], '教育学');
    });

    test('成功后解析卡片与分类，退出 loading', () async {
      adapter.responseBody = listJson([1, 2]);
      final container = makeContainer();

      await container.read(knowledgeControllerProvider.notifier).loadCards();

      final state = container.read(knowledgeControllerProvider);
      expect(state.cards.map((c) => c.id), [1, 2]);
      expect(state.cards.first.keyPoints.single.term, '教育目的');
      expect(state.categories, ['教育学', '心理学']);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
    });

    test('可选字段缺省时用默认值，不抛异常', () async {
      adapter.responseBody = <String, dynamic>{
        'cards': [
          {'id': 7, 'title': '最小卡片', 'front': '正面', 'back': '背面'},
        ],
        'categories': <String>[],
      };
      final container = makeContainer();

      await container.read(knowledgeControllerProvider.notifier).loadCards();

      final card = container.read(knowledgeControllerProvider).cards.single;
      expect(card.category, '未分类');
      expect(card.tags, isEmpty);
      expect(card.keyPoints, isEmpty);
    });
  });

  group('loadCards 失败路径', () {
    test('服务端 500：error 可读、卡片为空、退出 loading', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();

      await container.read(knowledgeControllerProvider.notifier).loadCards();

      final state = container.read(knowledgeControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, contains('500'));
      expect(state.cards, isEmpty);
    });

    test('响应缺 cards 字段：进 error，不静默当成空列表', () async {
      adapter.responseBody = <String, dynamic>{
        'categories': ['教育学'],
      };
      final container = makeContainer();

      await container.read(knowledgeControllerProvider.notifier).loadCards();

      final state = container.read(knowledgeControllerProvider);
      expect(state.error, isNotNull, reason: '契约变了要看得见，不能退化成「你没有卡片」');
      expect(state.isLoading, isFalse);
    });

    test('刷新失败不清空已上屏的卡片', () async {
      var count = 0;
      adapter.handler = (options) {
        count++;
        if (count == 1) return jsonBody(listJson([1]));
        return jsonBody({'message': 'boom'}, statusCode: 500);
      };
      final container = makeContainer();
      final notifier = container.read(knowledgeControllerProvider.notifier);
      await notifier.loadCards();
      expect(container.read(knowledgeControllerProvider).cards, hasLength(1));

      await notifier.loadCards();

      final state = container.read(knowledgeControllerProvider);
      expect(state.error, contains('500'));
      expect(state.cards, hasLength(1), reason: '一次失败的刷新不该让列表闪成空白');
    });

    test('失败后重试成功，error 被清空', () async {
      adapter.statusCode = 500;
      final container = makeContainer();
      final notifier = container.read(knowledgeControllerProvider.notifier);
      await notifier.loadCards();
      expect(container.read(knowledgeControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = listJson([3]);
      await notifier.loadCards();

      final state = container.read(knowledgeControllerProvider);
      expect(state.error, isNull);
      expect(state.cards.single.id, 3);
    });
  });

  group('createCard', () {
    test('先 POST 载荷，成功后重新拉列表', () async {
      adapter.handler = (options) {
        if (options.method == 'POST') {
          return jsonBody({'id': 9});
        }
        return jsonBody(listJson([9]));
      };
      final container = makeContainer();
      final notifier = container.read(knowledgeControllerProvider.notifier);

      await notifier.createCard({
        'title': '新卡片',
        'front': '问',
        'back': '答',
        'category': '教育学',
        'tags': ['教育目的'],
      });

      expect(adapter.posts.single.path, '/knowledge/cards');
      expect(adapter.posts.single.data, {
        'title': '新卡片',
        'front': '问',
        'back': '答',
        'category': '教育学',
        'tags': ['教育目的'],
      });
      expect(
        adapter.gets.single.path,
        '/knowledge/cards',
        reason: '创建成功后必须刷新，否则新卡片看不到',
      );
      expect(container.read(knowledgeControllerProvider).cards.single.id, 9);
    });

    test('创建失败把异常抛给调用方（界面要提示），且不污染列表状态', () async {
      adapter.handler = (options) =>
          jsonBody({'message': 'boom'}, statusCode: 500);
      final container = makeContainer();
      final notifier = container.read(knowledgeControllerProvider.notifier);

      await expectLater(
        notifier.createCard({'title': 'x'}),
        throwsA(isA<DioException>()),
      );

      final state = container.read(knowledgeControllerProvider);
      expect(state.error, isNull, reason: '异常抛给 UI，不该在列表状态里留下一条「加载失败」');
      expect(state.cards, isEmpty);
      expect(adapter.gets, isEmpty, reason: '创建失败时不该去刷新列表');
    });
  });

  group('竞态（请求序号防护）', () {
    test('后发请求胜出，先发的慢请求结果被丢弃', () async {
      final slowGate = Completer<void>();
      var count = 0;
      adapter.handler = (options) async {
        count++;
        if (count == 1) {
          await slowGate.future;
          return jsonBody(listJson([100]));
        }
        return jsonBody(listJson([200]));
      };
      final container = makeContainer();
      final notifier = container.read(knowledgeControllerProvider.notifier);

      final slow = notifier.loadCards(category: '慢分类');
      await pumpEventQueue();
      await notifier.loadCards(category: '快分类');
      expect(container.read(knowledgeControllerProvider).cards.single.id, 200);

      slowGate.complete();
      await slow;

      final state = container.read(knowledgeControllerProvider);
      expect(
        state.cards.single.id,
        200,
        reason: '旧请求后到必须被丢弃，否则快速切分类会看到上一次分类的卡片',
      );
      expect(state.isLoading, isFalse, reason: '旧请求不能把 loading 重新挂上');
    });
  });
}
