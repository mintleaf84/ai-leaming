// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parsePageParams,
  parsePagination,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "@/lib/api/pagination";

/**
 * `parsePageParams` 是页码式分页（`page`+`pageSize` / `page`+`limit`）的唯一入口。
 *
 * 历史坑（本文件即回归护栏）：`history.ts` 曾直接 `parseInt(page)`，`?page=abc`
 * 得到 NaN 并原样传给 service/SQL；`questions.ts` 曾自己
 * `Math.max(1, parseInt(page, 10) || 1)`，`?page=12oops` 静默被当成 12。
 */
describe("parsePageParams", () => {
  it("缺参：page=1，pageSize=默认 20，offset=0", () => {
    expect(parsePageParams({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("null 与 undefined 同义（zod optional 参数可能是 null）", () => {
    expect(
      parsePageParams({ page: null, pageSize: null, limit: null }),
    ).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("空串视作未提供（客户端清空输入框会发 ?pageSize=）", () => {
    expect(parsePageParams({ page: "", pageSize: "" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    // 空串时继续看下一个候选参数
    expect(parsePageParams({ pageSize: "", limit: "50" })).toEqual({
      page: 1,
      pageSize: 50,
      offset: 0,
    });
  });

  it('纯非法串（"abc"）回落到默认值，不产生 NaN', () => {
    const result = parsePageParams({ page: "abc", pageSize: "abc" });
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(Number.isNaN(result.page)).toBe(false);
    expect(Number.isNaN(result.pageSize)).toBe(false);
    expect(Number.isNaN(result.offset)).toBe(false);
  });

  it('"12oops" 不被静默截成 12（parseInt 的经典坑）', () => {
    expect(parsePageParams({ page: "12oops", pageSize: "12oops" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("小数 / 科学计数法也不是合法页码", () => {
    expect(parsePageParams({ page: "1.5" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("page=0 / 负数 → 1（否则 offset 会变负数下沉到 SQL）", () => {
    expect(parsePageParams({ page: "0" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    expect(parsePageParams({ page: "-5", pageSize: "-5" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    expect(parsePageParams({ page: "-5" }).offset).toBe(0);
  });

  it("pageSize=0 / 负数 → defaultPageSize（不是 1）", () => {
    expect(parsePageParams({ pageSize: "0" }).pageSize).toBe(DEFAULT_LIMIT);
    expect(
      parsePageParams({ pageSize: "-5" }, { defaultPageSize: 10 }).pageSize,
    ).toBe(10);
  });

  it("pageSize=999 截断到 maxPageSize（默认 100），offset 按夹后值算", () => {
    expect(parsePageParams({ page: "2", pageSize: "999" })).toEqual({
      page: 2,
      pageSize: MAX_LIMIT,
      offset: 100,
    });
    expect(
      parsePageParams({ page: "3", pageSize: "999" }, { maxPageSize: 50 }),
    ).toEqual({ page: 3, pageSize: 50, offset: 100 });
  });

  it("pageSize 与 limit 同时给时以 pageSize 为准", () => {
    expect(parsePageParams({ pageSize: "30", limit: "70" })).toEqual({
      page: 1,
      pageSize: 30,
      offset: 0,
    });
    // pageSize 非法时仍以它为准（回落到默认值），不退到 limit
    expect(parsePageParams({ pageSize: "abc", limit: "70" }).pageSize).toBe(20);
  });

  it("只给 limit 时按 limit 解析（questions 契约）", () => {
    expect(parsePageParams({ page: "2", limit: "10" })).toEqual({
      page: 2,
      pageSize: 10,
      offset: 10,
    });
  });

  it("defaultPageSize 可覆盖（history 用 10）", () => {
    expect(parsePageParams({}, { defaultPageSize: 10 })).toEqual({
      page: 1,
      pageSize: 10,
      offset: 0,
    });
    expect(parsePageParams({ page: "3" }, { defaultPageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      offset: 20,
    });
  });

  it("offset 永远是整数且非负", () => {
    const inputs = [
      {},
      { page: "abc" },
      { page: "1" },
      { page: "7", pageSize: "13" },
      { page: "999999", pageSize: "100" },
      { page: "-1", pageSize: "-1" },
    ];
    for (const query of inputs) {
      const { offset, page, pageSize } = parsePageParams(query);
      expect(Number.isInteger(offset)).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(page)).toBe(true);
      expect(Number.isInteger(pageSize)).toBe(true);
    }
  });
});

describe("parsePagination（limit/offset 入口未被本次收敛影响）", () => {
  it("合法值原样返回", () => {
    expect(parsePagination({ limit: "30", offset: "60" })).toEqual({
      limit: 30,
      offset: 60,
    });
  });

  it("limit 上限 100、非法回落 20；offset 负数回落 0", () => {
    expect(parsePagination({ limit: "999" }).limit).toBe(100);
    expect(parsePagination({ limit: "abc" }).limit).toBe(20);
    expect(parsePagination({ offset: "-9" }).offset).toBe(0);
  });
});
