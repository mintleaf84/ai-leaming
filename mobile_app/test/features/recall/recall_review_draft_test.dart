import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';

/// 幂等键纪律是这个 lane 的核心不变量：
/// 「同一 draft 实例的多次 `toPayload()` → 同一个 `clientKey`（且载荷内容冻结）」，
/// 「`reset()` 之后换成新 key」。服务端按 `(user_id, clientKey)` 幂等，
/// 这里一旦漂移，重试就会变成第二次真作答（进度被推进两次）。
void main() {
  group('generateRecallClientKey', () {
    test('形状是 UUID v4（version=4, variant=8/9/a/b）', () {
      final uuid = generateRecallClientKey();

      expect(
        uuid,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
      expect(uuid.length, 36);
    });

    test('不重复（默认 Random.secure）', () {
      final keys = <String>{};
      for (var i = 0; i < 500; i++) {
        keys.add(generateRecallClientKey());
      }

      expect(keys, hasLength(500));
    });

    test('可注入 Random 以便测试复现', () {
      final first = generateRecallClientKey(random: Random(42));
      final second = generateRecallClientKey(random: Random(42));

      expect(first, second);
      expect(first, isNot('00000000-0000-4000-8000-000000000000'));
    });
  });

  group('RecallReviewDraft：clientKey 跨重试不变', () {
    late int counter;

    RecallReviewDraft makeDraft({String typed = '甲 乙'}) {
      counter = 0;
      return RecallReviewDraft(
        cardId: 42,
        typed: typed,
        clientKeyFactory: () => 'ck-${++counter}',
      );
    }

    test('构造时生成一次：同一实例多次 toPayload 的 clientKey 相同', () {
      final draft = makeDraft();

      final first = draft.toPayload();
      final second = draft.toPayload();
      final third = draft.toPayload();

      expect(first['clientKey'], 'ck-1');
      expect(second['clientKey'], first['clientKey']);
      expect(third['clientKey'], first['clientKey']);
      expect(draft.clientKey, 'ck-1');
    });

    test('toPayload 冻结载荷：后续调用返回同一份（不可变）map', () {
      final draft = makeDraft();

      final first = draft.toPayload();
      final second = draft.toPayload();

      expect(identical(first, second), isTrue);
      expect(draft.isFrozen, isTrue);
      expect(() => first['cardId'] = 1, throwsUnsupportedError);
    });

    test('冻结后再改答案抛 StateError（不允许换答案重发）', () {
      final draft = makeDraft()..toPayload();

      expect(() => draft.setTyped('丙 丁'), throwsStateError);
      expect(() => draft.setAllBlank(true), throwsStateError);
      expect(
        () => draft.setOverrides([
          const RecallOverride(index: 0, to: RecallVerdict.ok),
        ]),
        throwsStateError,
      );
    });

    test('reset 后 key 不同、载荷解冻，默认保留作答内容', () {
      final draft = makeDraft();
      final before = draft.toPayload();

      draft.reset();
      final after = draft.toPayload();

      expect(before['clientKey'], 'ck-1');
      expect(after['clientKey'], 'ck-2');
      expect(after['clientKey'], isNot(before['clientKey']));
      expect(draft.isFrozen, isTrue, reason: 'after 这次 toPayload 又重新冻结');
      expect(after['typed'], '甲 乙');
      expect(draft.typed, '甲 乙');
    });

    test('reset(clearAnswer: true) 清空作答与改判', () {
      final draft = RecallReviewDraft(
        cardId: 7,
        typed: '已作答',
        allBlank: true,
        overrides: [const RecallOverride(index: 1, to: RecallVerdict.ok)],
        clientKeyFactory: () => 'k',
      );

      draft.reset(clearAnswer: true);
      final payload = draft.toPayload();

      expect(payload['typed'], '');
      expect(payload.containsKey('allBlank'), isFalse);
      expect(payload.containsKey('overrides'), isFalse);
    });

    test('幂等键可以在构造时显式传入（跨进程恢复场景）', () {
      final draft = RecallReviewDraft(cardId: 1, clientKey: 'restored-key');

      expect(draft.clientKey, 'restored-key');
      expect(draft.toPayload()['clientKey'], 'restored-key');
    });
  });

  group('RecallReviewDraft：载荷形状', () {
    test('普通判分：cardId/typed/overrides/clientKey，无 allBlank', () {
      final draft = RecallReviewDraft(
        cardId: 42,
        typed: '依法治教',
        overrides: [
          const RecallOverride(index: 2, to: RecallVerdict.miss),
          const RecallOverride(index: 0, to: RecallVerdict.ok),
        ],
        clientKey: 'key-1',
      );

      final payload = draft.toPayload();

      expect(payload['cardId'], 42);
      expect(payload['typed'], '依法治教');
      expect(payload['clientKey'], 'key-1');
      expect(payload.containsKey('allBlank'), isFalse);
      expect(payload['overrides'], [
        {'index': 2, 'to': 'miss'},
        {'index': 0, 'to': 'ok'},
      ]);
    });

    test('没有改判时不发空 overrides 数组', () {
      final draft = RecallReviewDraft(cardId: 1, typed: 'x', clientKey: 'k');

      expect(draft.toPayload().containsKey('overrides'), isFalse);
    });

    test('全没想起：只发 allBlank，不发 overrides（两者互斥）', () {
      final draft = RecallReviewDraft(
        cardId: 42,
        typed: '',
        allBlank: true,
        overrides: [const RecallOverride(index: 0, to: RecallVerdict.ok)],
        clientKey: 'k',
      );

      final payload = draft.toPayload();

      expect(payload['allBlank'], isTrue);
      expect(payload.containsKey('overrides'), isFalse);
      expect(payload['typed'], '');
      expect(payload['cardId'], 42);
    });

    test('overrides 列表不可变（防止外部改到已发出的载荷）', () {
      final draft = RecallReviewDraft(
        cardId: 1,
        overrides: [const RecallOverride(index: 0, to: RecallVerdict.ok)],
        clientKey: 'k',
      );

      final payload = draft.toPayload();
      final overrides = payload['overrides'] as List<Map<String, dynamic>>;

      expect(
        () => overrides.add({'index': 1, 'to': 'miss'}),
        throwsUnsupportedError,
      );
    });

    test('构造参数里的 overrides 会被拷贝（外部 list 改动不影响 draft）', () {
      final mutable = [const RecallOverride(index: 0, to: RecallVerdict.ok)];
      final draft = RecallReviewDraft(
        cardId: 1,
        overrides: mutable,
        clientKey: 'k',
      );

      mutable.add(const RecallOverride(index: 1, to: RecallVerdict.miss));

      expect(draft.overrides, hasLength(1));
    });
  });
}
