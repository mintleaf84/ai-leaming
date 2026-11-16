// @vitest-environment node
import { describe, it, expect } from "vitest";
import { affectedRows } from "../affected-rows";

describe("affectedRows", () => {
  it("读到 rowsAffected（better-sqlite3 的 RunResult 形状）", () => {
    expect(affectedRows({ rowsAffected: 3 })).toBe(3);
  });

  it("读到 changes（部分驱动的形状）", () => {
    expect(affectedRows({ changes: 2 })).toBe(2);
  });

  it("**0 是合法值**，不能被当成「取不到」", () => {
    // 这条是这个函数存在的理由：`rowsAffected || fallback` 会把 0 当缺失，
    // 于是「一行都没删掉」被报成「全删了」
    expect(affectedRows({ rowsAffected: 0 })).toBe(0);
    expect(affectedRows({ rowsAffected: 0 }) ?? 99).toBe(0);
  });

  it("形状不认识时返回 null，由调用方兜底", () => {
    expect(affectedRows(undefined)).toBeNull();
    expect(affectedRows(null)).toBeNull();
    expect(affectedRows("nope")).toBeNull();
    expect(affectedRows({})).toBeNull();
    expect(affectedRows({ rowsAffected: "3" })).toBeNull();
  });
});
