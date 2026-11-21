import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/mastery/presentation/mastery_provider.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是掌握度树的**加载状态机**和**契约失败可见性**：
///
/// 1. **只有「拿到树」才算成功**：`/mastery/tree` 返回的是数组，实现直接 cast；
///    如果后端改成 `{tree: [...]}`，必须落到 `error` 上（界面提示重试），
///    而不是静默显示一棵空树——空树在界面上等于「你什么都没学过」。
/// 2. **失败不清空已有树**：一次失败的刷新不该把上屏的掌握度抹掉。
/// 3. **重试能清除 error**：`loadTree` 开头重置 `error: null`，否则重试成功后
///    界面仍挂着上一次的报错。
/// 4. **copyWith 的 error 语义**：`copyWith` 里 `error` 是无条件覆盖的，所以
///    任何一次 `copyWith(isLoading: ...)` 都会顺手清掉 error——这正是重试可行
///    的原因，也意味着「保留错误 + 更新其他字段」在本状态类上做不到。
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

  Map<String, dynamic> nodeJson(
    String name, {
    List<Map<String, dynamic>> children = const [],
  }) => <String, dynamic>{
    'name': name,
    'path': 'root.$name',
    'score': 72.5,
    'level': children.isEmpty ? 2 : 1,
    'children': children,
  };

  group('初始状态', () {
    test('空树、非加载中、无错误，且不发请求', () {
      final container = makeContainer();

      final state = container.read(masteryControllerProvider);

      expect(state.tree, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty);
    });
  });

  group('loadTree', () {
    test('成功：打 /mastery/tree，递归解析子节点', () async {
      adapter.responseBody = <Map<String, dynamic>>[
        nodeJson('教育学', children: [nodeJson('教育目的'), nodeJson('教学原则')]),
      ];
      final container = makeContainer();

      await container.read(masteryControllerProvider.notifier).loadTree();

      final request = adapter.requests.single;
      expect(request.path, '/mastery/tree');
      expect(request.method, 'GET');
      expect(request.queryParameters, isEmpty);

      final state = container.read(masteryControllerProvider);
      expect(state.tree.single.name, '教育学');
      expect(state.tree.single.children.map((n) => n.name), ['教育目的', '教学原则']);
      expect(state.tree.single.score, 72.5);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
    });

    test('score 为整数时也能解析（后端 int/double 混用）', () async {
      adapter.responseBody = <Map<String, dynamic>>[
        {'name': '心理学', 'path': 'root.心理学', 'score': 0, 'level': 1},
      ];
      final container = makeContainer();

      await container.read(masteryControllerProvider.notifier).loadTree();

      expect(container.read(masteryControllerProvider).tree.single.score, 0);
    });

    test('服务端 500：error 可读、树为空、退出 loading', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();

      await container.read(masteryControllerProvider.notifier).loadTree();

      final state = container.read(masteryControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, contains('500'));
      expect(state.tree, isEmpty);
    });

    test('响应不是数组（契约漂移）：进 error，不静默显示空树', () async {
      adapter.responseBody = <String, dynamic>{
        'tree': <Map<String, dynamic>>[],
      };
      final container = makeContainer();

      await container.read(masteryControllerProvider.notifier).loadTree();

      final state = container.read(masteryControllerProvider);
      expect(state.error, isNotNull);
      expect(state.isLoading, isFalse);
    });

    test('刷新失败不清空已上屏的树', () async {
      var count = 0;
      adapter.handler = (options) {
        count++;
        if (count == 1) {
          return jsonBody([nodeJson('教育学')]);
        }
        return jsonBody({'message': 'boom'}, statusCode: 500);
      };
      final container = makeContainer();
      final notifier = container.read(masteryControllerProvider.notifier);
      await notifier.loadTree();
      expect(container.read(masteryControllerProvider).tree, hasLength(1));

      await notifier.loadTree();

      final state = container.read(masteryControllerProvider);
      expect(state.error, contains('500'));
      expect(state.tree, hasLength(1), reason: '一次失败刷新不该让掌握度树整体消失');
    });

    test('失败后重试成功，error 被清空', () async {
      adapter.statusCode = 500;
      final container = makeContainer();
      final notifier = container.read(masteryControllerProvider.notifier);
      await notifier.loadTree();
      expect(container.read(masteryControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = <Map<String, dynamic>>[nodeJson('心理学')];
      await notifier.loadTree();

      final state = container.read(masteryControllerProvider);
      expect(state.error, isNull);
      expect(state.tree.single.name, '心理学');
    });
  });

  group('copyWith 的 error 语义', () {
    test('任何 copyWith 都会清掉 error（现状：无法保留错误同时更新其他字段）', () {
      const withError = MasteryState(error: '加载失败');

      final stillLoading = withError.copyWith(isLoading: true);

      expect(stillLoading.error, isNull);
      expect(stillLoading.isLoading, isTrue);
    });
  });
}
