import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/data/recall_repository.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';

/// 用 Dio 的 `HttpClientAdapter` 桩住真实网络：断言的是**发出去的请求**
/// （路径、查询参数、载荷），不是服务端实现——所以这些测试不联网也不碰数据库。
///
/// 这里守的两条线：
/// 1. 路径必须是 `/recall/...`。`Dio.baseUrl` 已含 `/api`，写成 `/api/recall/...`
///    会变成 `/api/api/recall/...`（404），而这类错误在界面上只表现为「加载失败」；
/// 2. `submitReview` 重试必须重发**同一份载荷**（同一个 `clientKey`）。
class RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = <RequestOptions>[];

  Object? responseBody;
  int statusCode = 200;
  String? contentType = 'application/json; charset=utf-8';

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(responseBody ?? const <String, dynamic>{}),
      statusCode,
      headers: contentType == null
          ? const <String, List<String>>{}
          : {
              Headers.contentTypeHeader: <String>[contentType!],
            },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late RecordingAdapter adapter;
  late RecallRepository repository;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    repository = RecallRepository(dio);
  });

  group('RecallRepository：路径与查询参数', () {
    test('getQueue 打 /recall/queue（不带 /api 前缀）', () async {
      adapter.responseBody = {
        'ids': [42],
        'due': 1,
        'fresh': 0,
        'total': 1,
        'estimatedMinutes': 1,
        'streakDays': 3,
      };

      final queue = await repository.getQueue();

      expect(adapter.requests.single.path, '/recall/queue');
      expect(queue.ids, [42]);
      expect(queue.streakDays, 3);
    });

    test('listDecks 带 limit/offset', () async {
      adapter.responseBody = {
        'data': <Object?>[],
        'meta': {'limit': 10, 'offset': 20, 'total': 0},
      };

      final page = await repository.listDecks(limit: 10, offset: 20);

      final request = adapter.requests.single;
      expect(request.path, '/recall/decks');
      expect(request.queryParameters, {'limit': 10, 'offset': 20});
      expect(page.decks, isEmpty);
      expect(page.meta.offset, 20);
    });

    test('getDeck 对 deckKey 做 URL 编码（含斜杠的 key 不能拼坏路径）', () async {
      adapter.responseBody = {
        'deck': {'deckKey': 'a/b', 'title': '标题', 'groups': <Object?>[]},
        'data': <Object?>[],
        'meta': {'limit': 20, 'offset': 0, 'total': 0},
      };

      await repository.getDeck('a/b', limit: 5, offset: 0);

      final request = adapter.requests.single;
      expect(request.path, '/recall/decks/a%2Fb');
      expect(request.queryParameters, {'limit': 5, 'offset': 0});
    });

    test('getCard 打 /recall/cards/{cardId}', () async {
      adapter.responseBody = {
        'cardId': 42,
        'cardKey': 'c-42',
        'deckKey': 'deck-1',
        'deckTitle': '卡组',
        'kind': 'list',
        'groupKey': null,
        'prompt': '题干',
        'items': [
          {
            'text': '条目',
            'keywords': ['条目'],
          },
        ],
        'blanks': null,
        'verbatim': false,
        'state': null,
        'mode': 'first',
        'pendingItems': null,
      };

      final card = await repository.getCard(42);

      expect(adapter.requests.single.path, '/recall/cards/42');
      expect(card.cardId, 42);
      expect(card.deckTitle, '卡组');
      expect(card.items!.single.text, '条目');
    });

    test('archive/unarchive 用 POST/DELETE 同一个路径', () async {
      adapter.responseBody = {'cardId': 42, 'archived': true};
      final archived = await repository.archive(42);
      expect(adapter.requests.last.path, '/recall/cards/42/archive');
      expect(adapter.requests.last.method, 'POST');
      expect(archived.archived, isTrue);

      adapter.responseBody = {'cardId': 42, 'restored': false};
      final restored = await repository.unarchive(42);
      expect(adapter.requests.last.path, '/recall/cards/42/archive');
      expect(adapter.requests.last.method, 'DELETE');
      expect(restored.restored, isFalse);
    });

    test('响应不是 JSON 对象时抛 FormatException（不把 null 当数据渲染）', () async {
      adapter.responseBody = [1, 2, 3];

      expect(repository.getQueue(), throwsA(isA<FormatException>()));
    });
  });

  group('RecallRepository.submitReview：重试复用同一份载荷', () {
    test('两次提交（模拟失败重试）发出去的 clientKey 与载荷完全一致', () async {
      adapter.responseBody = {
        'verdicts': ['ok', 'miss'],
        'rating': 'hard',
        'nextDue': '2026-11-20T00:00:00.000Z',
        'pendingItems': [1],
        'nextReviewText': '明天只重测这 1 条',
        'duplicate': false,
      };

      var counter = 0;
      final draft = RecallReviewDraft(
        cardId: 42,
        typed: '甲 乙',
        overrides: [const RecallOverride(index: 1, to: RecallVerdict.ok)],
        clientKeyFactory: () => 'ck-${++counter}',
      );

      final first = await repository.submitReview(draft);
      final second = await repository.submitReview(draft);

      expect(adapter.requests, hasLength(2));
      expect(adapter.requests.first.path, '/recall/reviews');
      expect(adapter.requests.first.method, 'POST');
      expect(adapter.requests.first.data, {
        'cardId': 42,
        'typed': '甲 乙',
        'overrides': [
          {'index': 1, 'to': 'ok'},
        ],
        'clientKey': 'ck-1',
      });
      // 第二次是重放：数据必须逐字节一致（Dio 会把同一个 map 序列化两次）
      expect(adapter.requests.last.data, adapter.requests.first.data);
      expect(counter, 1, reason: '重试不得重新生成幂等键');

      expect(first.verdicts, [RecallVerdict.ok, RecallVerdict.miss]);
      expect(first.nextReviewText, '明天只重测这 1 条');
      expect(second.rating, RecallRating.hard);
    });

    test('submitReviewPayload 可以直接重放一份已冻结载荷', () async {
      adapter.responseBody = {
        'verdicts': <Object?>[],
        'rating': 'good',
        'nextDue': '2026-12-01T00:00:00.000Z',
        'pendingItems': null,
        'nextReviewText': '下次 12 月 1 日',
        'duplicate': true,
      };

      const payload = <String, dynamic>{
        'cardId': 9,
        'typed': '',
        'allBlank': true,
        'clientKey': 'frozen-key',
      };

      final result = await repository.submitReviewPayload(payload);

      expect(adapter.requests.single.data, payload);
      expect(result.isDuplicate, isTrue);
      expect(result.pendingItems, isNull);
    });
  });
}
