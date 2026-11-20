import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDeadline,
  clearDrafts,
  loadDeadline,
  loadDrafts,
  saveDeadline,
  saveDrafts,
} from "../draft-storage";
import type { ExamDraftMap } from "../answer-sheet";

const SESSION = "sess-draft-test";

describe("作答草稿的本地暂存", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("存进去再取出来是同一份草稿", () => {
    const drafts: ExamDraftMap = {
      12: { kind: "choice", letters: ["A", "C"] },
      13: { kind: "fill", blanks: ["甲", "乙"] },
    };
    saveDrafts(SESSION, drafts);
    expect(loadDrafts(SESSION)).toEqual(drafts);
  });

  it("不同作答会话互不串味", () => {
    saveDrafts(SESSION, { 1: { kind: "choice", letters: ["A"] } });
    expect(loadDrafts("another-session")).toEqual({});
  });

  it("坏数据不会让作答页崩掉", () => {
    window.sessionStorage.setItem(`exam-draft:${SESSION}`, "{not json");
    expect(loadDrafts(SESSION)).toEqual({});

    window.sessionStorage.setItem(
      `exam-draft:${SESSION}`,
      JSON.stringify({ 1: { kind: "unknown" }, 2: { kind: "choice", letters: "x" } }),
    );
    expect(loadDrafts(SESSION)).toEqual({});
  });

  it("交卷后能清干净", () => {
    saveDrafts(SESSION, { 1: { kind: "choice", letters: ["A"] } });
    clearDrafts(SESSION);
    expect(loadDrafts(SESSION)).toEqual({});
  });
});

describe("deadline 的本地缓存", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("刷新后还能取到同一次作答的 deadline", () => {
    const deadline = "2026-11-20T12:00:00.000Z";
    saveDeadline(SESSION, deadline);
    expect(loadDeadline(SESSION)).toBe(deadline);
  });

  it("不限时（null）不写缓存，且能清掉旧值", () => {
    saveDeadline(SESSION, "2026-11-20T12:00:00.000Z");
    saveDeadline(SESSION, null);
    expect(loadDeadline(SESSION)).toBeNull();

    saveDeadline(SESSION, "2026-11-20T12:00:00.000Z");
    clearDeadline(SESSION);
    expect(loadDeadline(SESSION)).toBeNull();
  });
});
