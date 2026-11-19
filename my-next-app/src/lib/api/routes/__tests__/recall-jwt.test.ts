// @vitest-environment node
/**
 * `/api/recall/*` —— 用户 JWT 面的回忆自测接口。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `recall` / `recall-import` 服务层。不 mock 数据库也不 mock 服务：
 * 判分、FSRS 调度、`clientKey` 幂等、按用户隔离这几条契约只有真跑一遍库才算验证过
 * （docs/engineering.md 规则三）。
 *
 * 与 `external-recall.test.ts` 是同一套协议的两张面孔：那边是 API Key + scope，
 * 这边是登录 JWT。字段必须一致，测试断言因此刻意保持同形。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";
import { importDeck } from "@/lib/services/recall-import";
import { listDeckCards } from "@/lib/services/recall";

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

import recallApp from "../recall";

/** 与生产挂载点一致（`app.route("/recall", recallRoute)` + basePath `/api`） */
const API_PREFIX = "/api/recall";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, recallApp);
  return root;
}

const USER_A = 21;
const USER_B = 22;

async function seedUsers() {
  await testDbHelper.seedUser(USER_A, "recall-jwt-a");
  await testDbHelper.seedUser(USER_B, "recall-jwt-b");
}

/** 真 JWT（与 production 中间件同一套 payload 形状） */
async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `recall-jwt-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

let tokenA: string;
let tokenB: string;

function request(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
) {
  const { method = "GET", body, token = tokenA } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// ==================== 夹具 ====================

function listCard(cardKey: string) {
  return {
    cardId: cardKey,
    kind: "list" as const,
    prompt: `${cardKey} 的题干`,
    items: [
      { text: "建立安全制度", keywords: ["安全制度"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
    ],
    verbatim: false,
  };
}

/**
 * 直接走服务层导入（不经过 external 的 API Key 通道），再读回卡片主键。
 * 这样测试聚焦在 JWT 路由本身，而不是又一次验证导入协议。
 */
async function seedDeck(deckKey = "deck-jwt"): Promise<Map<string, number>> {
  await importDeck(
    USER_A,
    {
      schema: 1,
      deckId: deckKey,
      title: `卡组 ${deckKey}`,
      groups: [],
      cards: [listCard("j01"), listCard("j02")],
    },
    { onConflict: "keep" },
  );

  const page = await listDeckCards(USER_A, deckKey, { limit: 100, offset: 0 });
  expect(page).not.toBeNull();
  return new Map(
    (page?.cards ?? []).map((card) => [card.cardKey, card.cardId]),
  );
}

describe("/api/recall（用户 JWT 面）", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedUsers();
    tokenA = await tokenFor(USER_A);
    tokenB = await tokenFor(USER_B);
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ---------- 鉴权 ----------

  describe("鉴权", () => {
    it.each([
      ["GET", "/queue"],
      ["GET", "/decks"],
      ["GET", "/decks/deck-jwt"],
      ["GET", "/cards/1"],
      ["POST", "/reviews"],
      ["POST", "/cards/1/archive"],
      ["DELETE", "/cards/1/archive"],
    ])("%s %s 无 token → 401", async (method, path) => {
      const res = await request(path, {
        method,
        token: null,
        body: method === "POST" ? { cardId: 1, typed: "x" } : undefined,
      });
      expect(res.status).toBe(401);
    });

    it("无效 token → 401", async () => {
      const res = await request("/queue", { token: "not-a-jwt" });
      expect(res.status).toBe(401);
    });
  });

  // ---------- 队列 ----------

  describe("GET /queue", () => {
    it("导入 2 张新卡后队列含它们，字段与 external 同形", async () => {
      const ids = await seedDeck();

      const res = await request("/queue");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.due).toBe(0);
      expect(body.fresh).toBe(2);
      expect(body.total).toBe(body.ids.length);
      expect(body.estimatedMinutes).toBeGreaterThan(0);
      expect(body.streakDays).toBe(0);
      expect(body.ids).toEqual(
        expect.arrayContaining([ids.get("j01"), ids.get("j02")]),
      );
    });
  });

  // ---------- 单卡详情 ----------

  describe("GET /cards/:cardId", () => {
    it("新卡 mode=first、pendingItems=null、state=null", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j01");

      const res = await request(`/cards/${cardId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        cardId,
        cardKey: "j01",
        deckKey: "deck-jwt",
        deckTitle: "卡组 deck-jwt",
        kind: "list",
        mode: "first",
        pendingItems: null,
        state: null,
      });
      expect(body.items).toHaveLength(2);
    });

    it("复习后 mode/pendingItems 由 pendingItems 驱动（retest）", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j01") as number;

      // 只写对第 1 条 → 第 2 条进待重测
      const review = await request("/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度" },
      });
      expect(review.status).toBe(200);

      const body = await (await request(`/cards/${cardId}`)).json();
      expect(body.mode).toBe("retest");
      expect(body.pendingItems).toEqual([1]);
      expect(body.state).toMatchObject({ reps: 1, archived: false });
    });

    it("非法 cardId → 400；不存在 → 404", async () => {
      const bad = await request("/cards/abc");
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toContain("正整数");

      const missing = await request("/cards/999999");
      expect(missing.status).toBe(404);
      expect((await missing.json()).error).toContain("卡片不存在");
    });
  });

  // ---------- 卡组 ----------

  describe("GET /decks 与 /decks/{deckKey}", () => {
    it("卡组列表含 cardCount 与当前用户的进度统计", async () => {
      const ids = await seedDeck();
      await request("/reviews", {
        method: "POST",
        body: {
          cardId: ids.get("j01"),
          typed: "建立安全制度 开展安全演练",
        },
      });

      const body = await (await request("/decks")).json();
      expect(body.meta).toEqual({ limit: 20, offset: 0, total: 1 });
      expect(body.data[0]).toMatchObject({
        deckKey: "deck-jwt",
        title: "卡组 deck-jwt",
        cardCount: 2,
        activeCount: 1,
        archivedCount: 0,
      });
    });

    it("卡组详情分页生效；不存在 → 404", async () => {
      await seedDeck();

      const page = await (await request("/decks/deck-jwt?limit=1")).json();
      expect(page.deck).toEqual({
        deckKey: "deck-jwt",
        title: "卡组 deck-jwt",
        groups: [],
      });
      expect(page.data).toHaveLength(1);
      expect(page.meta).toEqual({ limit: 1, offset: 0, total: 2 });

      const missing = await request("/decks/nope");
      expect(missing.status).toBe(404);
    });
  });

  // ---------- 提交作答 ----------

  describe("POST /reviews", () => {
    it("正常一轮：verdicts/rating/nextDue/nextReviewText 齐全", async () => {
      const ids = await seedDeck();
      const res = await request("/reviews", {
        method: "POST",
        body: {
          cardId: ids.get("j01"),
          typed: "建立安全制度 开展安全演练",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        verdicts: ["ok", "ok"],
        rating: "good",
        pendingItems: null,
        duplicate: false,
      });
      expect(body.nextDue).toBeTruthy();
      expect(body.nextReviewText).toMatch(/^下次 \d{1,2} 月 \d{1,2} 日$/);
    });

    it("同一 clientKey 重放 → duplicate=true 且 nextDue 与首次相同（幂等不丢）", async () => {
      const ids = await seedDeck();
      const payload = {
        cardId: ids.get("j01"),
        typed: "建立安全制度 开展安全演练",
        clientKey: "mobile-idem-key",
      };

      const first = await (
        await request("/reviews", { method: "POST", body: payload })
      ).json();
      expect(first.duplicate).toBe(false);

      const second = await (
        await request("/reviews", { method: "POST", body: payload })
      ).json();

      expect(second.duplicate).toBe(true);
      expect(second.nextDue).toBe(first.nextDue);
      expect(second.verdicts).toEqual(first.verdicts);
      // 调度没被二次推进：reps 仍是 1，日志只有一条
      const states = await testDbHelper.db
        .select()
        .from(schema.recall_card_states);
      expect(states).toHaveLength(1);
      expect(states[0].reps).toBe(1);
      const logs = await testDbHelper.db
        .select()
        .from(schema.recall_review_logs);
      expect(logs).toHaveLength(1);
    });

    it("卡片不存在 → 404", async () => {
      const res = await request("/reviews", {
        method: "POST",
        body: { cardId: 424242, typed: "随便写点" },
      });
      expect(res.status).toBe(404);
    });

    it("缺少 typed → 400（不是 500）", async () => {
      const ids = await seedDeck();
      const res = await request("/reviews", {
        method: "POST",
        body: { cardId: ids.get("j01") },
      });
      expect(res.status).toBe(400);
    });
  });

  // ---------- 用户隔离 ----------

  describe("用户隔离", () => {
    it("A 复习后 B 读同一 cardId 仍是 state=null（进度不串）", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j01") as number;

      const review = await request("/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度 开展安全演练" },
      });
      expect(review.status).toBe(200);

      const mine = await (await request(`/cards/${cardId}`)).json();
      expect(mine.state).toMatchObject({ reps: 1 });

      const others = await (
        await request(`/cards/${cardId}`, { token: tokenB })
      ).json();
      expect(others.state).toBeNull();
      expect(others.mode).toBe("first");

      // B 自己的复习不会推进 A 的调度
      const bReview = await request("/reviews", {
        method: "POST",
        token: tokenB,
        body: { cardId, typed: "建立安全制度 开展安全演练" },
      });
      expect(bReview.status).toBe(200);

      const states = await testDbHelper.db
        .select()
        .from(schema.recall_card_states);
      expect(states).toHaveLength(2);
      const mineAfter = await (await request(`/cards/${cardId}`)).json();
      expect(mineAfter.state.reps).toBe(1);
    });

    it("B 的队列状态独立：A 归档不影响 B 的队列", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j01");

      const archive = await request(`/cards/${cardId}/archive`, {
        method: "POST",
      });
      expect(archive.status).toBe(200);

      const mineQueue = await (await request("/queue")).json();
      expect(mineQueue.ids).not.toContain(cardId);

      const othersQueue = await (
        await request("/queue", { token: tokenB })
      ).json();
      expect(othersQueue.ids).toContain(cardId);
    });
  });

  // ---------- 归档 ----------

  describe("归档 / 取消归档", () => {
    it("归档后队列不再包含该卡；重复归档幂等", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j01");

      const first = await request(`/cards/${cardId}/archive`, {
        method: "POST",
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ cardId, archived: true });

      // 队列是「新卡池 + 到期池」：归档后两个池子都不该有它
      const queue = await (await request("/queue")).json();
      expect(queue.ids).not.toContain(cardId);
      expect(queue.ids).toContain(ids.get("j02"));

      const second = await request(`/cards/${cardId}/archive`, {
        method: "POST",
      });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ cardId, archived: true });

      const states = await testDbHelper.db
        .select()
        .from(schema.recall_card_states);
      expect(states).toHaveLength(1);
      expect(states[0].archived).toBe(1);
    });

    it("取消归档后卡片回到队列；没归档过时 restored=false 且不算错误", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("j02");

      const notYet = await request(`/cards/${cardId}/archive`, {
        method: "DELETE",
      });
      expect(notYet.status).toBe(200);
      expect(await notYet.json()).toEqual({ cardId, restored: false });

      await request(`/cards/${cardId}/archive`, { method: "POST" });
      const restore = await request(`/cards/${cardId}/archive`, {
        method: "DELETE",
      });
      expect(restore.status).toBe(200);
      expect(await restore.json()).toEqual({ cardId, restored: true });

      const queue = await (await request("/queue")).json();
      expect(queue.ids).toContain(cardId);
    });

    it("归档不存在的卡 → 404；cardId 非法 → 400", async () => {
      const missing = await request("/cards/999999/archive", {
        method: "POST",
      });
      expect(missing.status).toBe(404);

      const bad = await request("/cards/abc/archive", { method: "POST" });
      expect(bad.status).toBe(400);
    });
  });

  // ---------- OpenAPI ----------

  it("7 条 recall 路由都进了 OpenAPI spec，路径参数是 {param} 形式", () => {
    const doc = recallApp.getOpenAPIDocument({
      openapi: "3.0.0",
      info: { version: "1.0.0", title: "test" },
    });

    const operations: Array<[string, string]> = [];
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const method of Object.keys(item ?? {})) {
        operations.push([method.toUpperCase(), path]);
      }
    }

    expect(operations).toEqual(
      expect.arrayContaining([
        ["GET", "/queue"],
        ["GET", "/decks"],
        ["GET", "/decks/{deckKey}"],
        ["GET", "/cards/{cardId}"],
        ["POST", "/reviews"],
        ["POST", "/cards/{cardId}/archive"],
        ["DELETE", "/cards/{cardId}/archive"],
      ]),
    );
    expect(operations).toHaveLength(7);
    for (const path of Object.keys(doc.paths ?? {})) {
      expect(path).not.toContain(":");
    }
  });
});
