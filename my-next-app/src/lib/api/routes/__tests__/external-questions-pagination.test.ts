// @vitest-environment node
/**
 * 外部 API：题库列表分页口径对拍（P6 —— 手写分页归零后的行为等价证明）
 *
 * `GET /api/external/questions` 原本自己算 `Math.max(1, parseInt(page))` 与
 * `(page-1)*limit`，现已改用 `parsePageParams`（`src/lib/api/pagination.ts`）。
 * 这份测试钉住两件事：
 *
 *   1. **合法输入逐字不变** —— 下面每个用例的 `page/limit/total/totalPages` 与
 *      `data[].id` 序列，都是改造前用同一份 seed（30 题，按 id 升序）实测的结果。
 *   2. **非法输入差异只发生在"垃圾页码"上** —— 这是 `parsePageParams` 文档写明的
 *      口径变化（`Number.parseInt("12oops")` 会静默取 12，共享解析器要求整串是整数）。
 *
 * 改前（`Math.max(1, parseInt(page))` + `parsePagination({limit})`）→ 改后
 * （`parsePageParams({page, limit}, {defaultPageSize:20, maxPageSize:100})`）实测对照：
 *
 * | query                  | 改前 page/limit | 改前 data[].id      | 改后 page/limit | 改后 data[].id      |
 * | ---------------------- | --------------- | ------------------- | --------------- | ------------------- |
 * | （无参数）             | 1 / 20          | 1..20               | 1 / 20          | 1..20               |
 * | `page=1&limit=20`      | 1 / 20          | 1..20               | 1 / 20          | 1..20               |
 * | `page=2&limit=25`      | 2 / 25          | 26..30              | 2 / 25          | 26..30              |
 * | `page=3&limit=25`      | 3 / 25          | （空）              | 3 / 25          | （空）              |
 * | `limit=100000`         | 1 / 100         | 1..30               | 1 / 100         | 1..30               |
 * | `page=2&limit=100000`  | 2 / 100         | （空）              | 2 / 100         | （空）              |
 * | `page=0` / `page=-5`   | 1 / 20          | 1..20               | 1 / 20          | 1..20               |
 * | `limit=abc` / `limit=0`| 1 / 20          | 1..20               | 1 / 20          | 1..20               |
 * | --- 非法页码（唯一允许的差异）---                                                |
 * | `page=abc`             | NaN→响应 null    | 1..20（offset NaN→0）| 1 / 20         | 1..20               |
 * | `page=`                | NaN→响应 null    | 1..20               | 1 / 20          | 1..20               |
 * | `page=12oops`          | 12 / 20         | （空）              | 1 / 20          | 1..20               |
 * | `page=5.5`             | 5 / 20          | （空）              | 1 / 20          | 1..20               |
 * | `page=1e1`             | 1 / 20          | 1..20               | 10 / 20         | （空）              |
 * | `page=12oops&limit=25` | 12 / 25         | （空）              | 1 / 25          | 1..25               |
 *
 * `page=1e1` 单独说明：共享解析器的规则是"整串能被 `Number` 解析成整数"，
 * 所以 `1e1` 被当作 10（`parseInt` 只取到 1）。这仍属于非法/非规范页码输入，
 * 不是客户端会发的写法；此处显式钉住，避免将来无意间再变一次。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";

let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
  getLegacyDb() {
    return testDbHelper.db;
  },
}));

import externalApp from "../external";

const API_PREFIX = "/api/external";
const ADMIN_USER = 42;
const ADMIN_KEY = "pagination-admin-key";
const SEEDED = 30;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

interface PageBody {
  data: Array<{ id: number }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function listPage(query = ""): Promise<PageBody> {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  const res = await root.request(`${API_PREFIX}/questions${query}`, {
    headers: { Authorization: `Bearer ${ADMIN_KEY}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as PageBody;
}

describe("外部题库列表分页口径", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await testDbHelper.seedUser(ADMIN_USER, "pagination-admin");
    await testDbHelper.db.insert(schema.api_keys).values({
      key_string: ADMIN_KEY,
      is_active: 1,
      scopes: "admin",
      user_id: ADMIN_USER,
    });
    // 固定 30 题：够覆盖"整页 / 末页 / 越界页 / 上限截断"四种形态
    await testDbHelper.db.insert(schema.questions).values(
      Array.from({ length: SEEDED }, (_, i) => ({
        content: `分页对拍题目 ${i + 1}：这是一段足够长的题干内容。`,
        options: JSON.stringify(["甲", "乙"]),
        answer: "A",
        tags: JSON.stringify(["对拍"]),
        type: "single",
        dimension: "knowledge",
      })),
    );
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== 合法输入：零改动 ====================

  describe("合法输入（与改造前逐字一致）", () => {
    it("缺参 → page=1, limit=20，取前 20 条", async () => {
      const body = await listPage();
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=1&limit=20 → 与缺参完全相同", async () => {
      const body = await listPage("?page=1&limit=20");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=2&limit=25 → 第二页 5 条（offset=25）", async () => {
      const body = await listPage("?page=2&limit=25");
      expect(body.pagination).toEqual({
        page: 2,
        limit: 25,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(26, 30));
    });

    it("page=3&limit=25 → 越界页仍回显 page=3（不夹到 totalPages），data 为空", async () => {
      const body = await listPage("?page=3&limit=25");
      expect(body.pagination).toEqual({
        page: 3,
        limit: 25,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data).toEqual([]);
    });

    it("limit=100000 → 截到上限 100，totalPages 重算为 1", async () => {
      const body = await listPage("?limit=100000");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 100,
        total: SEEDED,
        totalPages: 1,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, SEEDED));
    });

    it("page=2&limit=100000 → offset=100，data 为空", async () => {
      const body = await listPage("?page=2&limit=100000");
      expect(body.pagination).toEqual({
        page: 2,
        limit: 100,
        total: SEEDED,
        totalPages: 1,
      });
      expect(body.data).toEqual([]);
    });

    it.each([
      ["?page=0", 1],
      ["?page=-5", 1],
    ])("%s → page 夹到 1（改造前后一致）", async (query, expectedPage) => {
      const body = await listPage(query);
      expect(body.pagination.page).toBe(expectedPage);
      expect(body.pagination.limit).toBe(20);
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("limit 非法/为 0 → 回落默认 20（改造前后一致）", async () => {
      for (const query of ["?limit=abc", "?limit=0"]) {
        const body = await listPage(query);
        expect(body.pagination.page).toBe(1);
        expect(body.pagination.limit).toBe(20);
        expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
      }
    });
  });

  // ==================== 非法页码：唯一允许的差异 ====================

  describe("非法页码 → 安全默认值（改造前会漏 NaN / 静默截断）", () => {
    it("page=abc → 回落 page=1、offset=0（改造前响应 page 为 null，offset 为 NaN）", async () => {
      const body = await listPage("?page=abc");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=（空串）→ 视作未提供，回落 page=1（改造前 page 为 null）", async () => {
      const body = await listPage("?page=&limit=");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=12oops → 回落 page=1（改造前 parseInt 静默取 12，返回空页）", async () => {
      const body = await listPage("?page=12oops");
      expect(body.pagination.page).toBe(1);
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=5.5 → 回落 page=1（页码不接受小数）", async () => {
      const body = await listPage("?page=5.5");
      expect(body.pagination.page).toBe(1);
      expect(body.data.map((r) => r.id)).toEqual(range(1, 20));
    });

    it("page=1e1 → 按共享解析器口径取 10（改造前 parseInt 只取到 1）", async () => {
      // 非规范写法，但显式钉住：`Number("1e1") === 10` 且为整数，属"整串可解析"
      const body = await listPage("?page=1e1");
      expect(body.pagination.page).toBe(10);
      expect(body.data).toEqual([]);
    });

    it("非法 page 不影响合法 limit：page=12oops&limit=25 → page=1、limit=25", async () => {
      const body = await listPage("?page=12oops&limit=25");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 25,
        total: SEEDED,
        totalPages: 2,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, 25));
    });

    it("page=abc&limit=50 → 只有 page 回默认，limit 原样生效", async () => {
      const body = await listPage("?page=abc&limit=50");
      expect(body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: SEEDED,
        totalPages: 1,
      });
      expect(body.data.map((r) => r.id)).toEqual(range(1, SEEDED));
    });
  });
});
