// @vitest-environment node
/**
 * 调度（规格 §6 验收 4）：与 ts-fsrs 直接计算**逐字段对拍**。
 *
 * 对拍方法：
 * - 参考侧：`createRecallScheduler()` 与生产**同一份参数**（`src/lib/srs/fsrs-config.ts`），
 *   拿一个 `createEmptyCard(t0)` 的 Card 对象连续 `next()` 10 次，评分序列固定；
 * - 生产侧：完全走我们的 `applyReview()`——每步只从**表列**（due/stability/difficulty/
 *   state/reps/lapses/last_review）重建 Card，再写回表列；
 * - 断言每一步的列**完全相等**（`toEqual`，浮点也不许有偏差）。
 *
 * 参考值不是抄来的常量，而是同一份第三方库在同一时刻算出来的结果；这样升级
 * `ts-fsrs` 时测试会跟着变，不会出现"常量与库一起过期"的假绿。
 */
import { describe, it, expect } from "vitest";
import { Rating, createEmptyCard, type Grade } from "ts-fsrs";
import { createRecallScheduler } from "../../srs/fsrs-config";
import {
  applyReview,
  computePendingItems,
  createInitialState,
  isRetestDue,
  toFsrsCard,
  type RecallStateColumns,
} from "../scheduler";
import type { RecallDerivedRating, RecallItemVerdict } from "../types";

const RATING_TO_GRADE: Record<RecallDerivedRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

/** 固定 10 步评分序列：覆盖 New→Review、Hard、Again（掉回 Relearning）、连续 Good */
const RATING_SEQUENCE: RecallDerivedRating[] = [
  "good",
  "good",
  "hard",
  "again",
  "good",
  "hard",
  "good",
  "good",
  "again",
  "good",
];

/** 每次复习的时刻（相对 t0 的天数，严格递增） */
const DAY_OFFSETS = [0, 2, 5, 6, 9, 14, 20, 30, 45, 60];

const T0 = new Date("2026-11-01T01:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function at(dayOffset: number): Date {
  return new Date(T0.getTime() + dayOffset * DAY_MS);
}

function columnsOf(card: {
  due: Date;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  last_review?: Date;
}): RecallStateColumns {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

describe("createInitialState", () => {
  it("与 createEmptyCard() 的列完全一致（New 卡、due=now）", () => {
    const empty = createEmptyCard(T0);
    expect(createInitialState(T0)).toEqual(columnsOf(empty));
    expect(createInitialState(T0).state).toBe(0);
    expect(createInitialState(T0).last_review).toBeNull();
  });
});

describe("applyReview 与 ts-fsrs 逐字段对拍（规格验收 4）", () => {
  it("10 步固定序列：due/stability/difficulty/state/reps/lapses 全部相等", () => {
    const reference = createRecallScheduler();
    let referenceCard = createEmptyCard(T0);
    let ourState: RecallStateColumns | null = null;

    RATING_SEQUENCE.forEach((rating, index) => {
      const now = at(DAY_OFFSETS[index]);
      const beforeColumns = columnsOf(referenceCard);

      // 参考侧：直接用库算
      referenceCard = reference.next(
        referenceCard,
        now,
        RATING_TO_GRADE[rating],
      ).card;

      // 生产侧：只从表列重建
      const applied = applyReview(ourState, rating, now);
      ourState = applied.next;

      expect(applied.log.before, `第 ${index + 1} 步 before`).toEqual(
        beforeColumns,
      );
      expect(ourState, `第 ${index + 1} 步 after`).toEqual(
        columnsOf(referenceCard),
      );
    });
  });

  it("对拍同时验证「表列足够」：scheduled_days/elapsed_days 不进计算", () => {
    // 从同一个列状态出发，故意给"错误"的 elapsed_days / scheduled_days，
    // 结果必须一致——这两列没存进表里也不会影响调度。
    const state = createInitialState(T0);
    const afterOne = applyReview(state, "good", at(2)).next;

    const faithful = toFsrsCard(afterOne, at(5));
    const lying = { ...faithful, elapsed_days: 999, scheduled_days: 999 };
    const reference = createRecallScheduler();

    const a = reference.next(faithful, at(5), Rating.Good).card;
    const b = reference.next(lying, at(5), Rating.Good).card;
    expect(columnsOf(a)).toEqual(columnsOf(b));
  });

  it("非法 state 值显式报错（脏数据不能静默按 New 处理）", () => {
    expect(() =>
      toFsrsCard({ ...createInitialState(T0), state: 7 }, T0),
    ).toThrow(/state=7/);
  });

  it("首次作答 Good 之后 due 至少是明天（enable_short_term=false，无 1m/10m 学习步）", () => {
    const next = applyReview(null, "good", T0).next;
    expect(new Date(next.due).getTime() - T0.getTime()).toBeGreaterThanOrEqual(
      DAY_MS,
    );
  });
});

describe("computePendingItems", () => {
  function item(index: number, verdict: RecallItemVerdict) {
    return { index, verdict };
  }

  it("首发全对 → null", () => {
    expect(
      computePendingItems("first", [item(0, "ok"), item(1, "ok")], null),
    ).toBeNull();
  });

  it("首发部分错 → 记录错的条目下标（升序）", () => {
    expect(
      computePendingItems(
        "first",
        [item(0, "ok"), item(1, "miss"), item(3, "miss")],
        null,
      ),
    ).toEqual([1, 3]);
  });

  it("重测全对 → 清空", () => {
    expect(
      computePendingItems("retest", [item(1, "ok"), item(3, "ok")], [1, 3]),
    ).toBeNull();
  });

  it("重测仍错 → 取交集（只留仍错的）", () => {
    expect(
      computePendingItems("retest", [item(1, "ok"), item(3, "miss")], [1, 3]),
    ).toEqual([3]);
  });

  it("历史 pendingItems 已失效（下标对不上）但这次有错 → 用这次的错", () => {
    expect(computePendingItems("retest", [item(2, "miss")], [7, 8])).toEqual([
      2,
    ]);
  });

  it("没有历史 pending 时不会把错判成对", () => {
    expect(computePendingItems("retest", [item(2, "miss")], null)).toEqual([2]);
  });
});

describe("isRetestDue", () => {
  it("有 pendingItems 才是重测卡", () => {
    expect(isRetestDue([1])).toBe(true);
    expect(isRetestDue(null)).toBe(false);
    expect(isRetestDue([])).toBe(false);
  });
});
