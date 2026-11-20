import { describe, expect, it } from "vitest";
import {
  buildAnswerSheet,
  collectAnswers,
  countAnswered,
  countUnanswered,
  countFillBlanks,
  draftToUserAnswer,
  isDraftAnswered,
  isGradableType,
  userAnswerToDraft,
  type ExamDraftMap,
} from "../answer-sheet";
import type { ExamQuestion } from "../types";

function question(overrides: Partial<ExamQuestion> & { id: number }): ExamQuestion {
  return {
    content: "题干",
    options: ["甲", "乙", "丙"],
    type: "single",
    ...overrides,
  };
}

const questions: ExamQuestion[] = [
  question({ id: 1, type: "single" }),
  question({ id: 2, type: "multi" }),
  question({ id: 3, type: "fill_blank", content: "第一空 ____，第二空 ____" }),
];

describe("countFillBlanks", () => {
  it("按题干里的下划线占位符数空数", () => {
    expect(countFillBlanks("____ 与 ____")).toBe(2);
    expect(countFillBlanks("没有空")).toBe(1);
  });

  it("不依赖 answer：未交卷时服务端把答案置空", () => {
    expect(countFillBlanks("a ____ b")).toBe(1);
  });
});

describe("isGradableType", () => {
  it("只有客观题可进试卷", () => {
    expect(isGradableType("single")).toBe(true);
    expect(isGradableType("fill_blank")).toBe(true);
    expect(isGradableType("essay")).toBe(false);
    expect(isGradableType(null)).toBe(false);
  });
});

describe("isDraftAnswered", () => {
  it("选项题看是否有选中项", () => {
    expect(isDraftAnswered(undefined)).toBe(false);
    expect(isDraftAnswered({ kind: "choice", letters: [] })).toBe(false);
    expect(isDraftAnswered({ kind: "choice", letters: ["A"] })).toBe(true);
  });

  it("填空题只要有内容就算答过（服务端仍会判逐空匹配）", () => {
    expect(isDraftAnswered({ kind: "fill", blanks: ["", "  "] })).toBe(false);
    expect(isDraftAnswered({ kind: "fill", blanks: ["甲"] })).toBe(true);
  });
});

describe("draftToUserAnswer", () => {
  it("单选/判断提交标号", () => {
    expect(draftToUserAnswer({ kind: "choice", letters: ["B"] }, "single")).toBe("B");
    expect(draftToUserAnswer({ kind: "choice", letters: ["A"] }, "truefalse")).toBe("A");
  });

  it("多选提交排序后的 JSON 数组（与服务端集合比较对齐）", () => {
    expect(
      draftToUserAnswer({ kind: "choice", letters: ["C", "A"] }, "multi"),
    ).toBe('["A","C"]');
  });

  it("填空用中文分号连接，空值返回空串", () => {
    expect(draftToUserAnswer({ kind: "fill", blanks: ["甲", "乙"] }, "fill_blank")).toBe(
      "甲；乙",
    );
    expect(draftToUserAnswer(undefined, "single")).toBe("");
  });
});

describe("userAnswerToDraft", () => {
  it("与 draftToUserAnswer 互逆", () => {
    expect(userAnswerToDraft("A", "single")).toEqual({
      kind: "choice",
      letters: ["A"],
    });
    expect(userAnswerToDraft('["A","C"]', "multi")).toEqual({
      kind: "choice",
      letters: ["A", "C"],
    });
    expect(userAnswerToDraft("甲；乙", "fill_blank")).toEqual({
      kind: "fill",
      blanks: ["甲", "乙"],
    });
  });

  it("空串与多选空数组不算作答", () => {
    expect(userAnswerToDraft("", "single")).toBeUndefined();
    expect(userAnswerToDraft("[]", "multi")).toBeUndefined();
  });
});

describe("答题卡派生", () => {
  const drafts: ExamDraftMap = {
    1: { kind: "choice", letters: ["B"] },
    3: { kind: "fill", blanks: ["甲", "乙"] },
  };

  it("已答/未答/当前三种状态由草稿推导", () => {
    const cells = buildAnswerSheet(questions, drafts, 1);
    expect(cells.map((cell) => cell.position)).toEqual([1, 2, 3]);
    expect(cells.map((cell) => cell.status)).toEqual([
      "answered",
      "unanswered",
      "answered",
    ]);
    expect(cells.map((cell) => cell.isCurrent)).toEqual([false, true, false]);
  });

  it("统计数与草稿一致", () => {
    expect(countAnswered(questions, drafts)).toBe(2);
    expect(countUnanswered(questions, drafts)).toBe(1);
    expect(countUnanswered(questions, {})).toBe(3);
  });
});

describe("collectAnswers", () => {
  it("只提交答过的题，并带上该题用时", () => {
    const drafts: ExamDraftMap = {
      2: { kind: "choice", letters: ["A", "C"] },
    };
    const answers = collectAnswers(questions, drafts, { 2: 12_345, 1: 9_999 });
    expect(answers).toEqual([
      { questionId: 2, userAnswer: '["A","C"]', durationMs: 12_345 },
    ]);
  });

  it("没答的题不发 —— 服务端按 skipped 处理，不能发空串当答错", () => {
    expect(collectAnswers(questions, {}, {})).toEqual([]);
  });

  it("用时缺失按 0，且不出现负数", () => {
    const drafts: ExamDraftMap = { 1: { kind: "choice", letters: ["A"] } };
    expect(collectAnswers([questions[0]], drafts, {})[0].durationMs).toBe(0);
    expect(collectAnswers([questions[0]], drafts, { 1: -50 })[0].durationMs).toBe(0);
  });
});
