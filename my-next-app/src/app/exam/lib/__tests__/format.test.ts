import { describe, expect, it } from "vitest";
import {
  formatAnswerText,
  formatDuration,
  formatOvertime,
  formatPaperKind,
  formatPaperSource,
  formatScore,
  questionTypeLabel,
  truncateContent,
} from "../format";

describe("formatScore", () => {
  it("0~1 比例转成整数分", () => {
    expect(formatScore(0.85)).toBe("85 分");
    expect(formatScore(0.856)).toBe("86 分");
    expect(formatScore(1)).toBe("100 分");
  });

  it("缺省显示破折号，不漏出 null", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
    expect(formatScore(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("秒与分秒两种读法", () => {
    expect(formatDuration(45_000)).toBe("45 秒");
    expect(formatDuration(754_000)).toBe("12 分 34 秒");
    expect(formatDuration(120_000)).toBe("2 分");
  });

  it("没有用时信息时给一句人话", () => {
    expect(formatDuration(0)).toBe("不到 1 秒");
    expect(formatDuration(undefined)).toBe("不到 1 秒");
  });

  it("超时文案带前缀", () => {
    expect(formatOvertime(65_000)).toBe("超时 1 分 5 秒");
  });
});

describe("试卷类型与来源", () => {
  it("限时带分钟数，固定卷显示不限时", () => {
    expect(formatPaperKind({ kind: "timed", durationMinutes: 60 })).toBe(
      "限时 60 分钟",
    );
    expect(formatPaperKind({ kind: "fixed", durationMinutes: null })).toBe(
      "不限时",
    );
    // kind=timed 却没给分钟数时也不能显示成"限时 null 分钟"
    expect(formatPaperKind({ kind: "timed", durationMinutes: null })).toBe(
      "不限时",
    );
  });

  it("来源只有自动与手工两种", () => {
    expect(formatPaperSource("auto")).toBe("自动组卷");
    expect(formatPaperSource("manual")).toBe("手工组卷");
  });
});

describe("questionTypeLabel", () => {
  it("覆盖四种客观题与客观题之外的类型", () => {
    expect(questionTypeLabel("single")).toBe("单项选择");
    expect(questionTypeLabel("multi")).toBe("多项选择");
    expect(questionTypeLabel("truefalse")).toBe("判断");
    expect(questionTypeLabel("fill_blank")).toBe("填空");
    expect(questionTypeLabel("essay")).toBe("简答");
    expect(questionTypeLabel(undefined)).toBe("题目");
  });
});

describe("formatAnswerText", () => {
  it("多选 JSON 数组与连写字母都拆成顿号", () => {
    expect(formatAnswerText('["A","C"]')).toBe("A、C");
    expect(formatAnswerText("AC")).toBe("A、C");
  });

  it("填空的中文分号变成斜杠", () => {
    expect(formatAnswerText("甲；乙")).toBe("甲 / 乙");
  });

  it("空答案明确说未作答", () => {
    expect(formatAnswerText("")).toBe("未作答");
    expect(formatAnswerText(null)).toBe("未作答");
  });
});

describe("truncateContent", () => {
  it("压缩空白并按长度截断", () => {
    expect(truncateContent("a   b\nc")).toBe("a b c");
    expect(truncateContent("123456", 4)).toBe("1234…");
    expect(truncateContent("1234", 4)).toBe("1234");
  });
});
