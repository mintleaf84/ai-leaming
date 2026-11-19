import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/domain/recall_answer_alignment.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';

/// 两个纯函数的口径都以 web 端为准：
/// - `buildOverrides` ↔ `app/recall/lib/preview.ts`（屏上位置 → 卡内下标）
/// - `segmentAnswer` ↔ `lib/recall/matcher.ts` 的 `splitClozeSegments`
///   + `preview.ts` 的 `splitClozeAnswers`（补齐到空数）
void main() {
  group('buildOverrides：屏上位置 → 卡内下标', () {
    test('首发（全部呈现）：位置与卡内下标相等', () {
      final overrides = buildOverrides(
        [0, 1, 2],
        [RecallVerdict.ok, RecallVerdict.ok, RecallVerdict.miss],
      );

      expect(overrides, [
        const RecallOverride(index: 0, to: RecallVerdict.ok),
        const RecallOverride(index: 1, to: RecallVerdict.ok),
        const RecallOverride(index: 2, to: RecallVerdict.miss),
      ]);
    });

    test('重测呈现子集：屏上第 0 条是卡内第 3 条', () {
      // presented = [3, 5]（本次只重测这两条）
      final overrides = buildOverrides(
        [3, 5],
        [RecallVerdict.miss, RecallVerdict.ok],
      );

      expect(overrides, [
        const RecallOverride(index: 3, to: RecallVerdict.miss),
        const RecallOverride(index: 5, to: RecallVerdict.ok),
      ]);
      // 发 0/1 会被服务端判成「改判下标不在本次呈现的条目里」→ 400
      expect(overrides.map((o) => o.index), isNot(contains(0)));
    });

    test('给了预判结果：只输出真正改判的条目', () {
      final overrides = buildOverrides(
        [0, 1, 2],
        [RecallVerdict.ok, RecallVerdict.ok, RecallVerdict.miss],
        algoVerdicts: [
          RecallVerdict.miss,
          RecallVerdict.ok,
          RecallVerdict.miss,
        ],
      );

      // 第 0 条 miss→ok 是改判；第 1、2 条与预判一致，不发
      expect(overrides, [const RecallOverride(index: 0, to: RecallVerdict.ok)]);
    });

    test('预判结果缺失的位置按「用户显式判分」发出', () {
      final overrides = buildOverrides(
        [2, 4],
        [RecallVerdict.ok, RecallVerdict.miss],
        algoVerdicts: [RecallVerdict.ok],
      );

      expect(overrides, [
        const RecallOverride(index: 4, to: RecallVerdict.miss),
      ]);
    });

    test('判分列表比呈现列表短：后面的位置不发（不猜）', () {
      final overrides = buildOverrides([0, 1, 2], [RecallVerdict.ok]);

      expect(overrides, [const RecallOverride(index: 0, to: RecallVerdict.ok)]);
    });

    test('空呈现列表 → 空改判', () {
      expect(buildOverrides(const [], const []), isEmpty);
    });

    test('负下标（脏数据）被丢弃，不发 400 的载荷', () {
      final overrides = buildOverrides(
        [-1, 2],
        [RecallVerdict.ok, RecallVerdict.miss],
      );

      expect(overrides, [
        const RecallOverride(index: 2, to: RecallVerdict.miss),
      ]);
    });
  });

  group('segmentAnswer：填空作答切段', () {
    test('0 空 → 空列表', () {
      expect(segmentAnswer('随便写点什么', 0), isEmpty);
      expect(segmentAnswer('', -1), isEmpty);
    });

    test('1 空：整段作答就是第 1 空', () {
      expect(segmentAnswer('1995', 1), ['1995']);
    });

    test('1 空：多余内容不并进结果（与 splitClozeSegments 的 slice 同口径）', () {
      // 用户多打了分隔符，只取前 N 段
      expect(segmentAnswer('甲 乙 丙', 1), ['甲']);
    });

    test('多空：按空白切', () {
      expect(segmentAnswer('依法治教 公平公正 教育优先', 3), ['依法治教', '公平公正', '教育优先']);
    });

    test('多空：按 `|` 切（优先级最高，段内空格保留）', () {
      expect(segmentAnswer('建立安全制度|开展安全演练', 2), ['建立安全制度', '开展安全演练']);
      // 有 `|` 时不再按空格切
      expect(segmentAnswer('甲 乙|丙 丁', 2), ['甲 乙', '丙 丁']);
    });

    test('多空：按换行切（\\n 与 \\r\\n 都认）', () {
      expect(segmentAnswer('甲\n乙\n丙', 3), ['甲', '乙', '丙']);
      expect(segmentAnswer('甲\r\n乙', 2), ['甲', '乙']);
    });

    test('多空：分号也当分隔符（中英文分号）', () {
      expect(segmentAnswer('甲；乙;丙', 3), ['甲', '乙', '丙']);
    });

    test('段数不足：补空串到 blanksCount（界面按下标对空）', () {
      expect(segmentAnswer('甲', 3), ['甲', '', '']);
      expect(segmentAnswer('', 2), ['', '']);
    });

    test('段数超出：丢弃多余段', () {
      expect(segmentAnswer('甲|乙|丙|丁', 2), ['甲', '乙']);
    });

    test('中间空段保留（用户跳过一个空），尾部空段先丢掉再补', () {
      expect(segmentAnswer('甲||丙', 3), ['甲', '', '丙']);
      // 尾部两个空段被丢掉，再补回两个空 → 语义等价，但避免错位
      expect(segmentAnswer('甲||', 3), ['甲', '', '']);
      expect(segmentAnswer('||甲', 2), ['', '']);
    });

    test('每段去首尾空白', () {
      expect(segmentAnswer('  甲  |  乙  ', 2), ['甲', '乙']);
    });
  });
}
