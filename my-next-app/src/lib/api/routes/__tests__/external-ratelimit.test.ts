// @vitest-environment node
/**
 * 外部接口限流（docs/api.md §8 / §9）
 *
 * 为什么必须按 **API Key** 而不是 IP 计：agent 通常共用一个出口 IP，
 * 按 IP 会把"一个调用方跑飞"放大成"所有人都被限流"。
 *
 * 这里直接下调 `externalRateLimits` 的限额来验证 429 —— 真要发 120 次请求才能
 * 触发阈值，测试会慢到没人愿意跑。限额对象是导出可写的，正是为此。
 *
 * 三个容易写出假绿的点，本文件逐个钉住：
 *   1. 限流器的计数是模块级的，不重置会跨用例污染（前一个用例打满桶，后一个用例首个请求就 429）；
 *   2. 只断言"不是 429"是假绿 —— 鉴权失败也会给出非 429，所以断言前两次是 400（参数校验）；
 *   3. 用另一把 read key 测"读桶与写桶隔离"也是假绿 —— read key 打写接口本来就 403。
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
import { __resetRateLimitStore } from "@/lib/auth/rate-limit";

const API_PREFIX = "/api/external";
const USER_ID = 7;

const WRITE_KEY = "ratelimit-write-key";
const WRITE_KEY_2 = "ratelimit-write-key-2";
const READ_KEY = "ratelimit-read-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const { method = "GET", body, key = WRITE_KEY } = options;
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
    { key_string: WRITE_KEY, is_active: 1, scopes: "write", user_id: USER_ID },
    {
      key_string: WRITE_KEY_2,
      is_active: 1,
      scopes: "write",
      user_id: USER_ID,
    },
    { key_string: READ_KEY, is_active: 1, scopes: "read", user_id: USER_ID },
  ]);
}

describe("外部接口限流", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
    // 模块级计数必须逐用例清零：否则前一个用例打满的写桶会让后一个用例首个请求就 429
    __resetRateLimitStore();
    // 写桶限 2 次/分钟，读桶保持原值（读写桶独立计数）
    externalRateLimits.write.limit = 2;
  });

  afterEach(async () => {
    externalRateLimits.read = { ...ORIGINAL_LIMITS.read };
    externalRateLimits.write = { ...ORIGINAL_LIMITS.write };
    await testDbHelper.close();
  });

  it("超过写桶限额返回 429，Retry-After 与 body.retryAfter 一致", async () => {
    // 用空 body 打写接口：限流在参数校验之前计数，所以被校验拒掉的请求同样算一次
    const first = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    const second = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    // 不是 429 还不够：鉴权/服务器故障也会给出非 429。这里要求真的走到了参数校验
    expect(first.status).toBe(400);
    expect(second.status).toBe(400);

    const third = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    expect(third.status).toBe(429);
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");

    const headerSeconds = Number(third.headers.get("Retry-After"));
    expect(headerSeconds).toBeGreaterThan(0);

    const body = await third.json();
    expect(body.error).toContain("请求过于频繁");
    // 头与 body 必须是同一个数：只读其中一处客户端会在另一处上退避错
    expect(body.retryAfter).toBe(headerSeconds);
  });

  it("读写桶相互独立：写桶耗尽后，同一把 key 的读请求仍可用", async () => {
    for (let i = 0; i < 3; i += 1) {
      await request("/practice/answers", { method: "POST", body: {} });
    }
    const blocked = await request("/practice/answers", {
      method: "POST",
      body: {},
    });
    expect(blocked.status).toBe(429);

    // 同一把 key 走读接口（write 作用域包含 read）：不能因为写桶满了就被挡
    const read = await request("/questions?page=1&limit=1", { key: WRITE_KEY });
    expect(read.status).toBe(200);
    expect(read.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  it("限流按 key 分离：一把 key 打满写桶，另一把 write key 仍能写", async () => {
    for (let i = 0; i < 3; i += 1) {
      await request("/practice/answers", { method: "POST", body: {} });
    }
    expect(
      (await request("/practice/answers", { method: "POST", body: {} })).status,
    ).toBe(429);

    // 第二把 **同样是 write 作用域** 的 key：既不会被 429，也不是被 403 挡掉的假绿
    const other = await request("/practice/answers", {
      method: "POST",
      body: {},
      key: WRITE_KEY_2,
    });
    expect(other.status).toBe(400);
  });

  it("HEAD 计入读配额而不是写配额", async () => {
    // 先把写桶打满
    for (let i = 0; i < 3; i += 1) {
      await request("/practice/answers", { method: "POST", body: {} });
    }

    const head = await createRootApp().request(
      `${API_PREFIX}/questions?page=1&limit=1`,
      { method: "HEAD", headers: { Authorization: `Bearer ${WRITE_KEY}` } },
    );
    // HEAD 走读桶：写桶满不影响它
    expect(head.status).not.toBe(429);
  });
});
