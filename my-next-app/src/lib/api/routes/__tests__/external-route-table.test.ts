// @vitest-environment node
/**
 * 外部 API：路由表护栏
 *
 * 背景：`routes/external.ts` 曾被拆成 `routes/external/{questions,srs,recall,notes,misc}.ts`
 * + 聚合 `index.ts`。拆分是纯搬移，但"少挂一个 route"这种事 tsc 与单元测试都发现不了
 * —— 只有真的发一次请求才知道。这里把 `/api/external` 的路径清单固化成快照，并逐条
 * 打一次真实请求：
 *
 *   1. OpenAPI 文档里的路径/方法集合必须与清单完全一致（新增/漏挂都会红）；
 *   2. 每个路径都必须真的被挂载（响应不能是 Hono 的框架默认 404 纯文本）。
 *
 * 断言的是"路由存在"，不是"业务成功"：因此允许 400/401/404(JSON)/500，
 * 只拒绝框架默认 404 —— 那才是"这个 path 根本没挂上"。
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
const ADMIN_KEY = "route-table-admin-key";
const USER = 41;

/**
 * `/api/external` 的全部路径（拆分前的口径，排序后）。
 *
 * 新增接口时同步更新本清单 —— 这是有意的摩擦：移动端/agent 的契约面就这么大。
 */
const EXTERNAL_PATHS = [
  "/knowledge/cards",
  "/mastery",
  "/mindmaps",
  "/mindmaps/{id}",
  "/notes",
  "/notes/{id}",
  "/practice/answers",
  "/practice/sessions",
  "/practice/sessions/{id}",
  "/questions",
  "/questions/batch",
  "/questions/{id}",
  "/recall/cards",
  "/recall/cards/{cardId}",
  "/recall/cards/{cardId}/archive",
  "/recall/decks",
  "/recall/decks/{deckKey}",
  "/recall/decks/{deckKey}/cards/{cardKey}",
  "/recall/queue",
  "/recall/reviews",
  "/srs/reviews",
  "/srs/summary",
  "/stats",
  "/wrong-book",
  "/wrong-book/stats",
] as const;

/** 每个路径上注册的方法（OpenAPI 文档里的键，小写） */
const EXTERNAL_OPERATIONS: Record<string, string[]> = {
  "/knowledge/cards": ["get"],
  "/mastery": ["get"],
  "/mindmaps": ["get"],
  "/mindmaps/{id}": ["get"],
  "/notes": ["get"],
  "/notes/{id}": ["get"],
  "/practice/answers": ["post"],
  "/practice/sessions": ["get"],
  "/practice/sessions/{id}": ["get"],
  "/questions": ["get", "post"],
  "/questions/batch": ["post"],
  "/questions/{id}": ["get", "patch"],
  "/recall/cards": ["post"],
  "/recall/cards/{cardId}": ["get"],
  "/recall/cards/{cardId}/archive": ["delete", "post"],
  "/recall/decks": ["get", "post"],
  "/recall/decks/{deckKey}": ["get"],
  "/recall/decks/{deckKey}/cards/{cardKey}": ["delete"],
  "/recall/queue": ["get"],
  "/recall/reviews": ["post"],
  "/srs/reviews": ["post"],
  "/srs/summary": ["get"],
  "/stats": ["get"],
  "/wrong-book": ["get"],
  "/wrong-book/stats": ["get"],
};

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function openApiOperations(): Record<string, string[]> {
  const doc = externalApp.getOpenAPIDocument({
    openapi: "3.0.0",
    info: { version: "1.0.0", title: "test", description: "" },
  });
  const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(
    Object.keys(paths)
      .sort()
      .map((path) => [path, Object.keys(paths[path]).sort()]),
  );
}

/** 路径参数落成合法值（`{id}` → `1`），保证请求进的是路由而不是参数校验死路 */
function fillParams(path: string): string {
  return path.replace(/\{[^}]+\}/g, "1");
}

describe("外部 API 路由表", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  it("OpenAPI 文档的路径集合与清单一致（首尾 + 数量）", () => {
    const operations = openApiOperations();
    const paths = Object.keys(operations);

    expect(paths).toEqual([...EXTERNAL_PATHS]);
    expect(paths.length).toBe(25);
    expect(paths[0]).toBe("/knowledge/cards");
    expect(paths.at(-1)).toBe("/wrong-book/stats");

    // 每个路径的方法也要对齐：漏挂一个方法同样是契约破坏
    for (const path of paths) {
      expect(operations[path], `路径 ${path} 的方法集合`).toEqual(
        EXTERNAL_OPERATIONS[path],
      );
    }

    const operationCount = paths.reduce(
      (sum, path) => sum + operations[path].length,
      0,
    );
    expect(operationCount).toBe(29);
  });

  it("每个路径都被真正挂载（不是框架默认 404）", async () => {
    await testDbHelper.seedUser(USER, "route-table-user");
    await testDbHelper.db.insert(schema.api_keys).values([
      {
        key_string: ADMIN_KEY,
        is_active: 1,
        scopes: "admin",
        user_id: USER,
      },
    ]);

    const reachability: Array<{
      method: string;
      path: string;
      status: number;
    }> = [];

    for (const [path, methods] of Object.entries(EXTERNAL_OPERATIONS)) {
      for (const method of methods) {
        const upper = method.toUpperCase();
        const hasBody =
          upper === "POST" || upper === "PATCH" || upper === "PUT";
        const res = await createRootApp().request(
          `${API_PREFIX}${fillParams(path)}`,
          {
            method: upper,
            headers: {
              Authorization: `Bearer ${ADMIN_KEY}`,
              ...(hasBody ? { "Content-Type": "application/json" } : {}),
            },
            ...(hasBody ? { body: JSON.stringify({}) } : {}),
          },
        );
        const text = await res.text();

        reachability.push({ method: upper, path, status: res.status });

        // Hono 的默认 404 是纯文本 "404 Not Found"；业务 404 都是 JSON。
        expect(
          text.trim() === "404 Not Found",
          `${upper} ${path} 没有挂到 /api/external 上（返回框架默认 404）`,
        ).toBe(false);
      }
    }

    expect(reachability).toHaveLength(29);
    expect(reachability[0]).toEqual({
      method: "GET",
      path: "/knowledge/cards",
      status: 200,
    });
  });
});
