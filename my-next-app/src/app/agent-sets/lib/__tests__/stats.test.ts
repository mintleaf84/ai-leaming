import { describe, expect, it } from "vitest";
import {
  applyFlag,
  derivePendingCount,
  progressPercent,
  selectPendingItems,
} from "../stats";
import type { AgentSetItem, AgentSetSummary } from "../types";

function summary(overrides: Partial<AgentSetSummary> = {}): AgentSetSummary {
  return {
    id: 1,
    title: "教育心理学 · 弱项强化",
    agent: "claude-code",
    model: "claude-sonnet-4.5",
    targetTags: ["学习动机"],
    note: null,
    status: "active",
    createdAt: "2026-11-21T08:00:00.000Z",
    totalQuestions: 10,
    doneCount: 2,
    flaggedCount: 1,
    pendingCount: 7,
    unread: true,
    lastScore: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

function item(id: number, answered = false): AgentSetItem {
  return {
    position: id,
    answered,
    question: {
      id,
      content: `第 ${id} 题`,
      options: ["甲", "乙"],
      type: "single",
    },
  };
}

describe("derivePendingCount", () => {
  it("没有服务端未做数时，用总量 − 已做 − 已反馈", () => {
    expect(
      derivePendingCount({
        totalQuestions: 10,
        doneCount: 3,
        flaggedCount: 2,
      }),
    ).toBe(5);
  });

  it("服务端给了未做数就以它为准（不重复做减法）", () => {
    expect(
      derivePendingCount({
        totalQuestions: 10,
        doneCount: 3,
        flaggedCount: 2,
        serverPending: 4,
      }),
    ).toBe(4);
  });

  it("服务端值超过总量或为负数时夹到合法区间", () => {
    expect(
      derivePendingCount({
        totalQuestions: 4,
        doneCount: 0,
        flaggedCount: 0,
        serverPending: 99,
      }),
    ).toBe(4);
    expect(
      derivePendingCount({
        totalQuestions: 4,
        doneCount: 4,
        flaggedCount: 4,
      }),
    ).toBe(0);
  });
});

describe("selectPendingItems", () => {
  it("已做的题不再出现在待做列表里", () => {
    const items = [item(1, true), item(2), item(3, true)];
    expect(selectPendingItems(items).map((entry) => entry.question.id)).toEqual([
      2,
    ]);
  });
});

describe("applyFlag", () => {
  it("反馈成功后：题从列表消失、未做 −1、已反馈 +1，总量不变", () => {
    const items = [item(1), item(2), item(3)];
    const result = applyFlag(summary(), items, 2);

    expect(result.removed).toBe(true);
    expect(result.remaining).toBe(6);
    expect(result.items.map((entry) => entry.question.id)).toEqual([1, 3]);
    expect(result.summary.pendingCount).toBe(6);
    expect(result.summary.flaggedCount).toBe(2);
    expect(result.summary.totalQuestions).toBe(10);
  });

  it("重复反馈同一题不会把未做数减两次", () => {
    const first = applyFlag(summary(), [item(1), item(2)], 1);
    const second = applyFlag(first.summary, first.items, 1);

    expect(second.removed).toBe(false);
    expect(second.summary.pendingCount).toBe(first.summary.pendingCount);
    expect(second.summary.flaggedCount).toBe(first.summary.flaggedCount);
  });
});

describe("progressPercent", () => {
  it("按已做/总量取整，总量为 0 时给 0 而不是 NaN", () => {
    expect(progressPercent(3, 10)).toBe(30);
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(20, 10)).toBe(100);
  });
});
