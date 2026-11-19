import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/domain/recall_card.dart';
import 'package:mobile_app/features/recall/domain/recall_deck.dart';
import 'package:mobile_app/features/recall/domain/recall_queue.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';

/// 这些 JSON 是按 `my-next-app/src/lib/api/routes/external.ts` 的 recall 段
/// （`RecallCardSchema` / `RecallCardStateSchema` / `RecallReviewResponseSchema` …）
/// 逐字段抄下来的线上形状，包含真实出现过的可空形态：
/// - `state: null`（新卡）
/// - `last_review: null` / `pendingItems: null`
/// - 卡片详情多出的 `deckKey`/`deckTitle`/`mode`/`pendingItems`
void main() {
  group('RecallQueue.fromJson', () {
    test('完整队列载荷', () {
      final queue = RecallQueue.fromJson({
        'ids': [42, 43, 44],
        'due': 2,
        'fresh': 1,
        'total': 3,
        'estimatedMinutes': 4,
        'streakDays': 7,
      });

      expect(queue.ids, [42, 43, 44]);
      expect(queue.due, 2);
      expect(queue.fresh, 1);
      expect(queue.total, 3);
      expect(queue.estimatedMinutes, 4);
      expect(queue.streakDays, 7);
      expect(queue.isEmpty, isFalse);
      expect(queue.firstCardId, 42);
    });

    test('空队列 + 缺字段不炸', () {
      final queue = RecallQueue.fromJson({'ids': <Object?>[]});

      expect(queue.ids, isEmpty);
      expect(queue.total, 0);
      expect(queue.streakDays, 0);
      expect(queue.isEmpty, isTrue);
      expect(queue.firstCardId, isNull);
    });

    test('数字字符串与符点数字也能读回来', () {
      final queue = RecallQueue.fromJson({
        'ids': ['7', 8.0],
        'due': '1',
        'total': 2.0,
      });

      expect(queue.ids, [7, 8]);
      expect(queue.due, 1);
      expect(queue.total, 2);
    });

    test('toJson 回环', () {
      const original = RecallQueue(
        ids: [1, 2],
        due: 1,
        fresh: 1,
        total: 2,
        estimatedMinutes: 3,
        streakDays: 5,
      );
      final round = RecallQueue.fromJson(original.toJson());

      expect(round.ids, original.ids);
      expect(round.total, original.total);
      expect(round.streakDays, original.streakDays);
    });
  });

  group('RecallDeck / RecallDeckPage.fromJson', () {
    test('卡组列表（含 meta 分页）', () {
      final page = RecallDeckListPage.fromJson({
        'data': [
          {
            'deckKey': 'jiaoyu-fagui',
            'title': '教育法规',
            'cardCount': 12,
            'activeCount': 3,
            'archivedCount': 1,
            'dueCount': 2,
          },
        ],
        'meta': {'limit': 20, 'offset': 0, 'total': 1},
      });

      expect(page.decks, hasLength(1));
      expect(page.decks.single.deckKey, 'jiaoyu-fagui');
      expect(page.decks.single.title, '教育法规');
      expect(page.decks.single.cardCount, 12);
      expect(page.decks.single.activeCount, 3);
      expect(page.decks.single.archivedCount, 1);
      expect(page.decks.single.dueCount, 2);
      expect(page.meta.total, 1);
      expect(page.meta.hasMore, isFalse);
    });

    test('卡组列表：计数缺失退化为 0，分页 meta 缺失不炸', () {
      final page = RecallDeckListPage.fromJson({
        'data': [
          {'deckKey': 'deck-1', 'title': '标题'},
        ],
      });

      expect(page.decks.single.cardCount, 0);
      expect(page.decks.single.dueCount, 0);
      expect(page.meta.limit, 0);
      expect(page.meta.total, 0);
    });

    test('卡组详情：groups.order 可缺省，data 里两种卡型并存', () {
      final page = RecallDeckPage.fromJson({
        'deck': {
          'deckKey': 'jiaoyu-fagui',
          'title': '教育法规',
          'groups': [
            {'groupId': 'g1', 'title': '总则', 'order': 1},
            {'groupId': 'g2', 'title': '罚则'},
          ],
        },
        'data': [
          {
            'cardId': 42,
            'cardKey': 'c-42',
            'kind': 'list',
            'groupKey': 'g1',
            'prompt': '列举教育法规的基本原则',
            'items': [
              {
                'text': '依法治教',
                'keywords': ['依法治教', '依法'],
              },
            ],
            'blanks': null,
            'verbatim': false,
            'state': null,
          },
          {
            'cardId': 43,
            'cardKey': 'c-43',
            'kind': 'cloze',
            'groupKey': null,
            'prompt': '《教育法》自【　】年施行',
            'items': null,
            'blanks': [
              {
                'answers': ['1995'],
              },
            ],
            'verbatim': false,
            'state': {
              'due': '2026-11-20T00:00:00.000Z',
              'stability': 1.5,
              'difficulty': 5.2,
              'state': 2,
              'reps': 3,
              'lapses': 1,
              'last_review': null,
              'pendingItems': [0],
              'archived': false,
            },
          },
        ],
        'meta': {'limit': 20, 'offset': 0, 'total': 2},
      });

      expect(page.deck.title, '教育法规');
      expect(page.deck.groups, hasLength(2));
      expect(page.deck.groups.first.order, 1);
      expect(page.deck.groups.last.order, isNull);

      final listCard = page.cards.first;
      expect(listCard.kind, RecallCardKind.list);
      expect(listCard.items, hasLength(1));
      expect(listCard.items!.single.text, '依法治教');
      expect(listCard.items!.single.keywords, ['依法治教', '依法']);
      expect(listCard.blanks, isNull);
      expect(listCard.state, isNull);
      // 卡组页不返回 mode/pendingItems：按首发处理
      expect(listCard.mode, RecallCardMode.first);
      expect(listCard.pendingItems, isNull);

      final clozeCard = page.cards.last;
      expect(clozeCard.kind, RecallCardKind.cloze);
      expect(clozeCard.items, isNull);
      expect(clozeCard.blanks!.single.answers, ['1995']);
      expect(clozeCard.groupKey, isNull);
      expect(clozeCard.state, isNotNull);
      expect(clozeCard.state!.lastReview, isNull);
      expect(clozeCard.state!.pendingItems, [0]);
      expect(clozeCard.state!.archived, isFalse);
    });
  });

  group('RecallCard.fromJson（卡片详情）', () {
    Map<String, dynamic> detailPayload() => {
      'cardId': 42,
      'cardKey': 'c-42',
      'deckKey': 'jiaoyu-fagui',
      'deckTitle': '教育法规',
      'kind': 'list',
      'groupKey': 'g1',
      'prompt': '列举教育法规的基本原则',
      'items': [
        {
          'text': '依法治教',
          'keywords': ['依法治教'],
        },
        {
          'text': '公平公正',
          'keywords': ['公平'],
        },
        {
          'text': '教育优先',
          'keywords': ['优先'],
        },
      ],
      'blanks': null,
      'verbatim': false,
      'state': {
        'due': '2026-11-20T00:00:00.000Z',
        'stability': 2.25,
        'difficulty': 5.0,
        'state': 2,
        'reps': 2,
        'lapses': 1,
        'last_review': '2026-11-19T01:00:00.000Z',
        'pendingItems': [2],
        'archived': false,
      },
      'mode': 'retest',
      'pendingItems': [2],
    };

    test('retest：只呈现 pendingItems 里的卡内下标', () {
      final card = RecallCard.fromJson(detailPayload());

      expect(card.cardId, 42);
      expect(card.deckKey, 'jiaoyu-fagui');
      expect(card.deckTitle, '教育法规');
      expect(card.groupKey, 'g1');
      expect(card.itemCount, 3);
      expect(card.mode, RecallCardMode.retest);
      expect(card.isRetest, isTrue);
      expect(card.pendingItems, [2]);
      expect(card.presentedIndexes, [2]);
      expect(card.state!.reps, 2);
      expect(card.state!.stability, 2.25);
    });

    test('first：呈现全部条目', () {
      final payload = detailPayload()
        ..['mode'] = 'first'
        ..['pendingItems'] = null
        ..['state'] = null;

      final card = RecallCard.fromJson(payload);

      expect(card.mode, RecallCardMode.first);
      expect(card.isRetest, isFalse);
      expect(card.pendingItems, isNull);
      expect(card.presentedIndexes, [0, 1, 2]);
      expect(card.state, isNull);
    });

    test('retest 但 pendingItems 全越界：退回首发（不呈现空列表）', () {
      final payload = detailPayload()
        ..['pendingItems'] = [9, -1]
        ..['state'] = null;

      final card = RecallCard.fromJson(payload);

      expect(card.presentedIndexes, [0, 1, 2]);
    });

    test('缺字段：kind 未知按 list，verbatim 缺省 false，items 缺失为 null', () {
      final card = RecallCard.fromJson({'cardId': 7, 'cardKey': 'c-7'});

      expect(card.kind, RecallCardKind.list);
      expect(card.items, isNull);
      expect(card.blanks, isNull);
      expect(card.verbatim, isFalse);
      expect(card.state, isNull);
      expect(card.itemCount, 0);
      expect(card.presentedIndexes, isEmpty);
    });

    test('填空卡：itemCount 数空位，presentedIndexes 走 blank 下标', () {
      final card = RecallCard.fromJson({
        'cardId': 9,
        'cardKey': 'c-9',
        'kind': 'cloze',
        'prompt': '【　】和【　】',
        'blanks': [
          {
            'answers': ['甲'],
          },
          {
            'answers': ['乙', '乙项'],
          },
        ],
        'items': null,
        'verbatim': false,
        'state': null,
        'mode': 'retest',
        'pendingItems': [1],
      });

      expect(card.kind, RecallCardKind.cloze);
      expect(card.itemCount, 2);
      expect(card.presentedIndexes, [1]);
      expect(card.blanks!.last.answers, ['乙', '乙项']);
    });

    test('toJson 保留可空字段的 null（不能折叠成缺字段）', () {
      final card = RecallCard.fromJson({
        'cardId': 9,
        'cardKey': 'c-9',
        'kind': 'cloze',
        'prompt': '题干',
        'items': null,
        'blanks': <Object?>[],
        'verbatim': true,
        'state': null,
        'mode': 'first',
        'pendingItems': null,
      });

      final json = card.toJson();

      expect(json['items'], isNull);
      expect(json['state'], isNull);
      expect(json['pendingItems'], isNull);
      expect(json['verbatim'], isTrue);
      expect(json['kind'], 'cloze');
    });
  });

  group('RecallReviewResult / 归档结果 fromJson', () {
    test('提交结果（带 pendingItems、非重复）', () {
      final result = RecallReviewResult.fromJson({
        'verdicts': ['ok', 'miss', 'ok'],
        'rating': 'hard',
        'nextDue': '2026-11-20T00:00:00.000Z',
        'pendingItems': [1],
        'nextReviewText': '明天只重测这 1 条',
        'duplicate': false,
      });

      expect(result.verdicts, [
        RecallVerdict.ok,
        RecallVerdict.miss,
        RecallVerdict.ok,
      ]);
      expect(result.rating, RecallRating.hard);
      expect(result.nextDue, '2026-11-20T00:00:00.000Z');
      expect(result.pendingItems, [1]);
      expect(result.nextReviewText, '明天只重测这 1 条');
      expect(result.duplicate, isFalse);
      expect(result.dryRun, isNull);
      expect(result.isPersisted, isTrue);
    });

    test('幂等重放：pendingItems=null、duplicate=true', () {
      final result = RecallReviewResult.fromJson({
        'verdicts': <Object?>[],
        'rating': 'good',
        'nextDue': '2026-11-25T00:00:00.000Z',
        'pendingItems': null,
        'nextReviewText': '下次 11 月 25 日',
        'duplicate': true,
      });

      expect(result.pendingItems, isNull);
      expect(result.isDuplicate, isTrue);
      expect(result.isPersisted, isFalse);
    });

    test('未知 rating 退化为 again，未知 verdict 退化为 miss', () {
      final result = RecallReviewResult.fromJson({
        'verdicts': ['yes', 'ok'],
        'rating': 'easy',
        'nextDue': '',
        'pendingItems': null,
        'nextReviewText': '',
        'duplicate': false,
      });

      expect(result.verdicts, [RecallVerdict.miss, RecallVerdict.ok]);
      expect(result.rating, RecallRating.again);
    });

    test('归档 / 取消归档', () {
      final archived = RecallArchiveResult.fromJson({
        'cardId': 42,
        'archived': true,
      });
      expect(archived.cardId, 42);
      expect(archived.archived, isTrue);

      final restored = RecallRestoreResult.fromJson({
        'cardId': 42,
        'restored': false,
      });
      expect(restored.cardId, 42);
      expect(restored.restored, isFalse);
    });
  });
}
