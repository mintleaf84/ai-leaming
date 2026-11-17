// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isImeComposing } from "../ime";

describe("isImeComposing", () => {
  it("React 合成事件：nativeEvent.isComposing 为 true 时是组合态", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true);
  });

  it("React 合成事件：nativeEvent.isComposing 为 false 时不是组合态", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false } })).toBe(false);
  });

  it("keyCode 229 视为组合态（部分 IME/老浏览器只给这个）", () => {
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
  });

  it("原生事件的 nativeEvent.keyCode 229 也认", () => {
    expect(isImeComposing({ nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("普通 Enter（isComposing false、keyCode 13）不是组合态", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false }, keyCode: 13 })).toBe(
      false,
    );
  });

  it("原生 DOM KeyboardEvent（没有 nativeEvent）：用事件自身的 isComposing", () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
    expect(isImeComposing({ isComposing: false })).toBe(false);
  });

  it("有 nativeEvent 时不信合成事件上的 isComposing（React 不转发该字段）", () => {
    expect(
      isImeComposing({ isComposing: true, nativeEvent: { isComposing: false } }),
    ).toBe(false);
  });

  it("空事件 / undefined 不抛错，按非组合态处理", () => {
    expect(isImeComposing(undefined)).toBe(false);
    expect(isImeComposing(null)).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });
});
