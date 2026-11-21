// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeParseJson, coerceJsonColumn } from "../json";

/**
 * 这两个 helper 是 30 多处 JSON 列解析的唯一入口，
 * 但此前只有 admin-service 的用例间接触发过一次回归（"已解析的对象被二次解析成空数组"）。
 * 这里把契约显式钉住，避免以后再被"顺手统一"改坏。
 */

describe("safeParseJson", () => {
  it("解析合法 JSON 文本", () => {
    expect(safeParseJson('["A","B"]', [])).toEqual(["A", "B"]);
    expect(safeParseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it("空值 / 未定义 / 空串回落默认值", () => {
    expect(safeParseJson(null, ["x"])).toEqual(["x"]);
    expect(safeParseJson(undefined, ["x"])).toEqual(["x"]);
    expect(safeParseJson("", ["x"])).toEqual(["x"]);
  });

  it("坏 JSON 回落默认值而不是抛错", () => {
    expect(safeParseJson("{坏", ["x"])).toEqual(["x"]);
    expect(safeParseJson("[1,", ["x"])).toEqual(["x"]);
    expect(safeParseJson("undefined", ["x"])).toEqual(["x"]);
  });

  it("合法但 falsy 的 JSON 不应被当成空值", () => {
    // 历史坑：早期实现写成 `return JSON.parse(value) || defaultValue`，
    // 于是 "0" / "false" / "[]" 会被替换成默认值，语义就变了。
    expect(safeParseJson("0", 42)).toBe(0);
    expect(safeParseJson("false", true)).toBe(false);
    expect(safeParseJson("[]", ["x"])).toEqual([]);
    expect(safeParseJson("{}", { a: 1 })).toEqual({});
  });

  it("默认值只在解析失败时使用，成功时原样返回解析结果", () => {
    const fallback = { keep: "me" };
    expect(safeParseJson('{"keep":"db"}', fallback)).toEqual({ keep: "db" });
    expect(safeParseJson("oops", fallback)).toBe(fallback);
  });
});

describe("coerceJsonColumn", () => {
  it("字符串走解析", () => {
    expect(coerceJsonColumn('["A","B"]', [])).toEqual(["A", "B"]);
    expect(coerceJsonColumn("坏", ["fallback"])).toEqual(["fallback"]);
  });

  it("已解析的数组 / 对象原样返回（不得二次解析）", () => {
    const parsed = ["A", "B"];
    expect(coerceJsonColumn(parsed, [])).toBe(parsed);

    const obj = { term: "甲", definition: "乙" };
    expect(coerceJsonColumn(obj, {})).toBe(obj);
  });

  it("null / undefined 回落默认值", () => {
    expect(coerceJsonColumn(null, ["x"])).toEqual(["x"]);
    expect(coerceJsonColumn(undefined, ["x"])).toEqual(["x"]);
  });

  it("空数组等 falsy 但非空的已解析值不被替换", () => {
    // 对应 admin-service 那条回归用例：`x || []` 写法会把已解析的空数组也当成缺失，
    // 但更关键的是非空值不能被丢掉。
    const empty: unknown[] = [];
    expect(coerceJsonColumn(empty, ["x"])).toBe(empty);
    expect(coerceJsonColumn(0, 42)).toBe(0);
    expect(coerceJsonColumn(false, true)).toBe(false);
  });
});
