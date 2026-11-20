import { describe, expect, it } from "vitest";
import { isSameRoute, shouldInterceptNavigation } from "../navigation";

const CURRENT = "/exam/session/sess-1";

describe("isSameRoute", () => {
  it("忽略查询串、锚点与末尾斜杠", () => {
    expect(isSameRoute("/exam", "/exam/")).toBe(true);
    expect(isSameRoute("/exam?page=2", "/exam")).toBe(true);
    expect(isSameRoute("/exam#top", "/exam")).toBe(true);
  });

  it("不同路径不算同一路由", () => {
    expect(isSameRoute("/practice", "/exam")).toBe(false);
  });
});

describe("shouldInterceptNavigation", () => {
  it("未交卷时拦下离开当前页的站内跳转", () => {
    expect(shouldInterceptNavigation("/practice", CURRENT, false)).toBe(true);
    expect(shouldInterceptNavigation("/exam", CURRENT, false)).toBe(true);
  });

  it("已交卷后不再打扰", () => {
    expect(shouldInterceptNavigation("/practice", CURRENT, true)).toBe(false);
  });

  it("同页锚点、空链接、非站内地址不拦", () => {
    expect(shouldInterceptNavigation("#answer-sheet", CURRENT, false)).toBe(false);
    expect(shouldInterceptNavigation(null, CURRENT, false)).toBe(false);
    expect(shouldInterceptNavigation("mailto:a@b.com", CURRENT, false)).toBe(false);
    expect(shouldInterceptNavigation("/exam/session/sess-1", CURRENT, false)).toBe(
      false,
    );
  });

  it("带域名的同页链接按路径判定", () => {
    expect(
      shouldInterceptNavigation(
        "http://localhost:3000/exam/session/sess-1",
        CURRENT,
        false,
      ),
    ).toBe(false);
    expect(
      shouldInterceptNavigation("http://localhost:3000/history", CURRENT, false),
    ).toBe(true);
  });
});
