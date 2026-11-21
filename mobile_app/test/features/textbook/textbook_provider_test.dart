import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/textbook/domain/textbook.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_provider.dart';

import '../../support/recording_adapter.dart';

/// 本文件分两部分：上面的 `fromJson` / `copyWith` 是纯数据层用例；下面追加的
/// 「列表控制器」「详情 provider」两组补的是**加载状态机**：
///
/// 1. **失败不能冒充「没有教材」**：5xx 必须落到 `error`，列表保持空，而不是
///    用空列表静默成功——否则界面显示「暂无教材」，用户以为书没了。
/// 2. **失败不清空已上屏的列表**，重试成功则清掉 error（`load()` 开头重置）。
/// 3. **详情失败用状态字段表达**：`textbookDetailProvider` 自己 catch，返回
///    `TextbookDetailState(error: ...)`，不是 AsyncError——上层靠 error 字段渲染。
/// 4. **竞态**：请求序号防护——先发后到的旧结果必须被丢弃，列表永远由最新
///    发出的那次请求决定。
void main() {
  group('Textbook fromJson 单元测试', () {
    final sampleJson = {
      'id': 1,
      'title': '测试教材',
      'author': '作者A',
      'description': '这是简介',
      'cover_url': '',
      'chapterCount': 5,
      'created_at': '2024-01-01',
    };

    test('正常 JSON 反序列化', () {
      final tb = Textbook.fromJson(sampleJson);

      expect(tb.id, 1);
      expect(tb.title, '测试教材');
      expect(tb.author, '作者A');
      expect(tb.description, '这是简介');
      expect(tb.chapterCount, 5);
    });

    test('可选字段为 null 时不报错', () {
      final json = {
        'id': 2,
        'title': '无作者教材',
        'author': null,
        'description': null,
        'cover_url': null,
        'chapterCount': 0,
        'created_at': '2024-01-01',
      };

      final tb = Textbook.fromJson(json);

      expect(tb.id, 2);
      expect(tb.author, isNull);
      expect(tb.description, isNull);
      expect(tb.chapterCount, 0);
    });
  });

  group('TextbookChapter fromJson 单元测试', () {
    test('正常章节反序列化', () {
      final json = {
        'id': 10,
        'textbook_id': 1,
        'title': '第一章',
        'order_index': 1,
        'parent_id': null,
        'level': 1,
        'created_at': '2024-01-01',
      };

      final ch = TextbookChapter.fromJson(json);

      expect(ch.id, 10);
      expect(ch.title, '第一章');
      expect(ch.parentId, isNull);
      expect(ch.level, 1);
    });

    test('有父章节时 parentId 正确解析', () {
      final json = {
        'id': 11,
        'textbook_id': 1,
        'title': '第一节',
        'order_index': 1,
        'parent_id': 10,
        'level': 2,
        'created_at': '2024-01-01',
      };

      final ch = TextbookChapter.fromJson(json);

      expect(ch.parentId, 10);
      expect(ch.level, 2);
    });
  });

  group('TextbookDetail fromJson 单元测试', () {
    test('正确解析教材详情与章节', () {
      final json = {
        'id': 1,
        'title': '完整教材',
        'author': '作者',
        'description': '简介',
        'cover_url': null,
        'chapterCount': 2,
        'created_at': '2024-01-01',
        'chapters': [
          {
            'id': 1,
            'textbook_id': 1,
            'title': '第一章',
            'order_index': 1,
            'parent_id': null,
            'level': 1,
            'created_at': '2024-01-01',
          },
          {
            'id': 2,
            'textbook_id': 1,
            'title': '第二章',
            'order_index': 2,
            'parent_id': null,
            'level': 1,
            'created_at': '2024-01-01',
          },
        ],
      };

      final detail = TextbookDetail.fromJson(json);

      expect(detail.textbook.title, '完整教材');
      expect(detail.chapters.length, 2);
      expect(detail.chapters[0].title, '第一章');
    });

    test('章节为空时正确解析', () {
      final json = {
        'id': 1,
        'title': '空章节教材',
        'chapterCount': 0,
        'created_at': '2024-01-01',
        'chapters': [],
      };

      final detail = TextbookDetail.fromJson(json);

      expect(detail.chapters, isEmpty);
    });
  });

  group('TextbookListState copyWith 测试', () {
    test('更新 textbooks 列表', () {
      const initial = TextbookListState();
      final tb = Textbook.fromJson({
        'id': 1,
        'title': '教材',
        'chapterCount': 3,
        'created_at': '2024-01-01',
      });

      final updated = initial.copyWith(textbooks: [tb]);

      expect(updated.textbooks.length, 1);
      expect(updated.isLoading, false);
    });

    test('isLoading 切换', () {
      const initial = TextbookListState();
      final loading = initial.copyWith(isLoading: true);

      expect(loading.isLoading, true);
      expect(loading.textbooks, isEmpty);
    });
  });

  // ---------------------------------------------------------------------------
  // 以下为「状态机」补充用例（原有纯数据层用例保持不变）
  // ---------------------------------------------------------------------------

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

  Map<String, dynamic> textbookJson(int id) => <String, dynamic>{
    'id': id,
    'title': '教材 $id',
    'author': '作者',
    'description': '简介',
    'cover_url': null,
    'chapterCount': 2,
    'created_at': '2026-11-18',
  };

  group('TextbookListController 状态机', () {
    test('初始状态：空列表、非加载中、无错误，且不发请求', () {
      final container = makeContainer();

      final state = container.read(textbookListControllerProvider);

      expect(state.textbooks, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty);
    });

    test('加载成功：打 /textbook，解析列表并退出 loading', () async {
      adapter.responseBody = [textbookJson(1), textbookJson(2)];
      final container = makeContainer();

      await container.read(textbookListControllerProvider.notifier).load();

      final request = adapter.requests.single;
      expect(request.path, '/textbook');
      expect(request.method, 'GET');
      expect(request.queryParameters, isEmpty);

      final state = container.read(textbookListControllerProvider);
      expect(state.textbooks.map((t) => t.id), [1, 2]);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
    });

    test('加载失败：error 可读、列表为空、退出 loading（不冒充「暂无教材」）', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();

      await container.read(textbookListControllerProvider.notifier).load();

      final state = container.read(textbookListControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, contains('500'));
      expect(state.textbooks, isEmpty);
    });

    test('失败后重试成功，error 被清空', () async {
      adapter.statusCode = 500;
      final container = makeContainer();
      final notifier = container.read(textbookListControllerProvider.notifier);
      await notifier.load();
      expect(container.read(textbookListControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = [textbookJson(3)];
      await notifier.load();

      final state = container.read(textbookListControllerProvider);
      expect(state.error, isNull);
      expect(state.textbooks.single.id, 3);
    });

    test('刷新失败不清空已上屏的教材', () async {
      var count = 0;
      adapter.handler = (options) {
        count++;
        if (count == 1) return jsonBody([textbookJson(1)]);
        return jsonBody({'message': 'boom'}, statusCode: 500);
      };
      final container = makeContainer();
      final notifier = container.read(textbookListControllerProvider.notifier);
      await notifier.load();
      expect(
        container.read(textbookListControllerProvider).textbooks,
        hasLength(1),
      );

      await notifier.load();

      final state = container.read(textbookListControllerProvider);
      expect(state.error, contains('500'));
      expect(state.textbooks, hasLength(1), reason: '一次失败刷新不该让教材库闪成空白');
    });

    test('竞态：后发请求胜出，先发的慢请求结果被丢弃', () async {
      final slowGate = Completer<void>();
      var count = 0;
      adapter.handler = (options) async {
        count++;
        if (count == 1) {
          await slowGate.future;
          return jsonBody([textbookJson(100)]);
        }
        return jsonBody([textbookJson(200)]);
      };
      final container = makeContainer();
      final notifier = container.read(textbookListControllerProvider.notifier);

      final slow = notifier.load();
      await pumpEventQueue();
      await notifier.load();
      expect(
        container.read(textbookListControllerProvider).textbooks.single.id,
        200,
      );

      slowGate.complete();
      await slow;

      final state = container.read(textbookListControllerProvider);
      expect(
        state.textbooks.single.id,
        200,
        reason: '旧请求后到必须被丢弃，否则连点刷新会闪回上一次的列表',
      );
      expect(state.isLoading, isFalse, reason: '旧请求不能把 loading 重新挂上');
    });
  });

  group('textbookDetailProvider', () {
    test('成功：路径带 textbookId，解析详情与章节', () async {
      adapter.responseBody = <String, dynamic>{
        ...textbookJson(7),
        'chapters': [
          {
            'id': 1,
            'textbook_id': 7,
            'title': '第一章',
            'order_index': 1,
            'parent_id': null,
            'level': 1,
            'created_at': '2026-11-18',
          },
        ],
      };
      final container = makeContainer();
      final sub = container.listen(textbookDetailProvider(7), (_, _) {});
      addTearDown(sub.close);

      final state = await container.read(textbookDetailProvider(7).future);

      expect(adapter.requests.single.path, '/textbook/7');
      expect(state.detail?.textbook.id, 7);
      expect(state.detail?.chapters.single.title, '第一章');
      expect(state.error, isNull);
      expect(state.isLoading, isFalse);
    });

    test('失败：以 error 字段表达（不是 AsyncError），详情为空', () async {
      adapter.statusCode = 404;
      adapter.responseBody = {'message': 'not found'};
      final container = makeContainer();
      final sub = container.listen(textbookDetailProvider(404), (_, _) {});
      addTearDown(sub.close);

      final state = await container.read(textbookDetailProvider(404).future);

      expect(state.detail, isNull);
      expect(state.error, contains('404'));
      expect(
        container.read(textbookDetailProvider(404)),
        isA<AsyncData<TextbookDetailState>>(),
        reason: '实现自己 catch 了异常，provider 本身不应变成 AsyncError',
      );
    });
  });
}
