// @vitest-environment node
/**
 * 外部接口限流（docs/api.md §8 / §9）
 *
 * 为什么必须按 **API Key** 而不是 IP 计：agent 通常共用一个出口 IP，
 * 按 IP 会把"一个调用方跑飞"放大成"所有人都被限流"。
 *
 * 这里直接下调 `externalRateLimits` 的限额来验证 429 —— 真要发 120 次请求才能
 * 触发阈值，测试会慢到没人愿意跑。限额对象是导出可写的，正是为此。
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

import externalApp, { externalRateLimits } from "../external";

const API_PREFIX = "/api/external";
const USER_ID = 7;

const WRITE_LIMIT_KEY = "ratelimit-write-key";
const READ_LIMIT_KEY = "ratelimit-read-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const { method = "GET", body, key = WRITE_LIMIT_KEY } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${key}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ORIGINAL_LIMITS = {
  read: { ...externalRateLimits.read },
  write: { ...externalRateLimits.write },
};

async function seedKeys() {
  await testDbHelper.seedUser(USER_ID, "ratelimit-user");
  await testDbHelper.db.insert(schema.api_keys).values([
    {
      key_string: WRITE_LIMIT_KEY,
      is_active: 1,
      scopes: "write",
      user_id: USER_ID,
    },
    {
      key_string: READ_LIMIT_KEY,
      is_active: 1,
      scopes: "read",
      user_id: USER_ID,
    },
  ]);
}

describe("外部接口限流", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
    // 写桶限 2 次/分钟，读桶保持原值（两个 key 各自独立计桶）
    externalRateLimits.write.limit = 2;
  });

  afterEach(async () => {
    externalRateLimits.read = { ...ORIGINAL_LIMITS.read };
    externalRateLimits.write = { ...ORIGINAL_LIMITS.write };
    await testDbHelper.close();
  });

  it("超过写桶限额返回 429，带 Retry-After 与可读的 retryAfter", async () => {
    // 用空 body 打写接口：限流在参数校验之前，被校验拒掉的请求同样计数
    const first = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    const second = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);

    const third = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();
    expect(Number(third.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await third.json();
    expect(body.error).toContain("请求过于频繁");
    // body 里也给一份秒数：agent 不解析响应头也能退避
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("读桶与写桶互不影响：写桶耗尽后 GET 仍然可用", async () => {
    for (let i = 0; i < 3; i += 1) {
      await request("/practice/answers", { method: "POST", body: {} });
    }

    const read = await request("/questions?page=1&limit=1", {
      key: READ_LIMIT_KEY,
    });
    expect(read.status).toBe(200);
    expect(read.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  it("限流按 key 分离：一个 key 被限不影响另一个 key 的写请求", async () => {
    // 先用 WRITE_LIMIT_KEY 把写桶打满
    for (let i = 0; i < 3; i += 1) {
      await request("/practice/answers", { method: "POST", body: {} });
    }
    const blocked = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    expect(blocked.status).toBe(429);

    // 换一个未超限的 key：同一路径同一个时间窗内仍应正常进入路由（不是 429）
    const other = await request("/practice/answers", {
      method: "POST",
      body: {},
      key: READ_LIMIT_KEY,
    });
    expect(other.status).not.toBe(429);
  });
});
