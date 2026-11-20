import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_MINUTES,
  buildPaperRequest,
  clampDurationMinutes,
  defaultPaperTitle,
  readCreatedPaperId,
} from "../paper-request";

describe("buildPaperRequest", () => {
  it("不限时：kind=fixed，不带 durationMinutes", () => {
    expect(
      buildPaperRequest({
        setTitle: "教育心理学 · 弱项强化",
        title: "周末自测",
        timed: false,
        durationMinutes: 60,
      }),
    ).toEqual({ title: "周末自测", kind: "fixed", durationMinutes: null });
  });

  it("限时：保留分钟数并夹到 5~180", () => {
    expect(
      buildPaperRequest({
        setTitle: "题集",
        title: "限时卷",
        timed: true,
        durationMinutes: 999,
      }),
    ).toEqual({ title: "限时卷", kind: "timed", durationMinutes: 180 });

    expect(clampDurationMinutes(0)).toBe(5);
    expect(clampDurationMinutes(Number.NaN)).toBe(DEFAULT_DURATION_MINUTES);
  });

  it("标题空着时回退到带题集名的默认标题", () => {
    const request = buildPaperRequest({
      setTitle: "教育心理学 · 弱项强化",
      title: "   ",
      timed: false,
      durationMinutes: 30,
    });
    expect(request.title).toBe(defaultPaperTitle({ title: "教育心理学 · 弱项强化" }));
  });
});

describe("readCreatedPaperId", () => {
  it("兼容 {paper:{id}} / {id} / {paperId} 三种返回", () => {
    expect(readCreatedPaperId({ paper: { id: 12 } })).toBe(12);
    expect(readCreatedPaperId({ id: 13 })).toBe(13);
    expect(readCreatedPaperId({ paperId: 14 })).toBe(14);
    expect(readCreatedPaperId({ paper: { id: "15" } })).toBe(15);
  });

  it("拿不到合法 id 时返回 null，让调用方明确报错而不是跳 /exam/undefined", () => {
    expect(readCreatedPaperId({})).toBeNull();
    expect(readCreatedPaperId({ paper: { id: 0 } })).toBeNull();
    expect(readCreatedPaperId(null)).toBeNull();
  });
});
