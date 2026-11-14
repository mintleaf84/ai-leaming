// @vitest-environment node
/**
 * 外部 API：回忆自测（Recall）读写接口
 *
 * 真实 SQLite（真实迁移）+ 真实鉴权中间件 + 真实服务层，不 mock SQL 也不 mock service：
 * 判分/调度/幂等/身份隔离这类契约只有真跑一遍库才算验证过（docs/engineering.md 规则三）。
 *
 * 覆盖：4 读 + 4 写接口、`clientKey` 幂等重放、内容隔离、scope 403、写审计。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
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

/** 挂到 `/api/external` 下再请求，与生产挂载点一致（审计里的 path 因此带前缀） */
const API_PREFIX = "/api/external";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

const WRITE_USER_ID = 7;
const OTHER_USER_ID = 8;

const WRITE_KEY = "recall-write-key";
const READ_KEY = "recall-read-key";
const OTHER_WRITE_KEY = "recall-other-write-key";

async function seedKeys() {
  await testDbHelper.seedUser(WRITE_USER_ID, "recall-writer");
  await testDbHelper.seedUser(OTHER_USER_ID, "recall-other");
  await testDbHelper.db.insert(schema.api_keys).values([
    {
      key_string: WRITE_KEY,
      is_active: 1,
      scopes: "write",
      user_id: WRITE_USER_ID,
    },
    {
      key_string: READ_KEY,
      is_active: 1,
      scopes: "read",
      user_id: WRITE_USER_ID,
    },
    {
      key_string: OTHER_WRITE_KEY,
      is_active: 1,
      scopes: "write",
      user_id: OTHER_USER_ID,
    },
  ]);
}

// ==================== 夹具 ====================

function listCard(cardId: string, extra: Record<string, unknown> = {}) {
  return {
    cardId,
    kind: "list",
    prompt: `${cardId} 的题干`,
    items: [
      { text: "建立安全制度", keywords: ["安全制度"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
    ],
    verbatim: false,
    ...extra,
  };
}

function clozeCard(cardId: string) {
  return {
    cardId,
    kind: "cloze",
    prompt: `${cardId} 的题干`,
    blanks: [{ answers: ["教育法"] }, { answers: ["义务教育"] }],
  };
}

/** 卡组文件（与导入接口 `json` 字段同格式：JSON 字符串） */
function deckJson(deckId: string, cards: unknown[]): string {
  return JSON.stringify({
    schema: 1,
    deckId,
    title: `卡组 ${deckId}`,
    groups: [],
    cards,
  });
}

function request(
  path: string,
  options: { method?: string; body?: unknown; key?: string | null } = {},
) {
  const { method = "GET", body, key = WRITE_KEY } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function importDeck(
  deckId: string,
  cards: unknown[],
  key: string = WRITE_KEY,
) {
  return request("/recall/decks", {
    method: "POST",
    body: { json: deckJson(deckId, cards) },
    key,
  });
}

async function countOf(table: unknown): Promise<number> {
  const rows = (await testDbHelper.db
    .select()
    .from(table as never)) as unknown[];
  return rows.length;
}

/** 导入 2 张卡的卡组，并返回卡片数字主键（按 cardKey 索引） */
async function seedDeck(deckId = "deck-recall"): Promise<Map<string, number>> {
  const res = await importDeck(deckId, [listCard("c01"), clozeCard("c02")]);
  expect(res.status).toBe(200);

  const detail = await request(`/recall/decks/${deckId}?limit=100&offset=0`);
  expect(detail.status).toBe(200);
  const body = await detail.json();
  return new Map(
    body.data.map((card: { cardId: number; cardKey: string }) => [
      card.cardKey,
      card.cardId,
    ]),
  );
}

describe("/api/external/recall", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ---------- OpenAPI 文档 ----------

  it("8 条 recall 路由都进了 OpenAPI spec（文档与实现同步）", () => {
    const doc = externalApp.getOpenAPIDocument({
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
        ["GET", "/recall/decks"],
        ["POST", "/recall/decks"],
        ["GET", "/recall/decks/{deckKey}"],
        ["DELETE", "/recall/decks/{deckKey}/cards/{cardKey}"],
        ["GET", "/recall/cards/{cardId}"],
        ["POST", "/recall/cards"],
        ["GET", "/recall/queue"],
        ["POST", "/recall/reviews"],
      ]),
    );
    // 路由总数 = 原有 10 条 + recall 8 条
    expect(operations).toHaveLength(18);

    // 路径参数必须是 OpenAPI 的 `{param}` 形式：`:param` 不是合法路径，
    // SDK 生成器会把它当成字面路径（存量缺陷，见 PR #162 评审）
    for (const path of Object.keys(doc.paths ?? {})) {
      expect(path).not.toContain(":");
    }
  });

  // ---------- 读：卡组列表 ----------

  describe("GET /recall/decks", () => {
    it("空库返回空数组与 total=0", async () => {
      const res = await request("/recall/decks");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        data: [],
        meta: { limit: 20, offset: 0, total: 0 },
      });
    });

    it("导入 2 卡卡组后 cardCount=2，且进度字段按身份统计", async () => {
      const ids = await seedDeck();
      // 用户 7 复习掉第一张卡：该卡应计入 activeCount
      const first = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: ids.get("c01"), typed: "建立安全制度 开展安全演练" },
      });
      expect(first.status).toBe(200);

      const res = await request("/recall/decks");
      const body = await res.json();
      expect(body.meta).toEqual({ limit: 20, offset: 0, total: 1 });
      expect(body.data[0]).toMatchObject({
        deckKey: "deck-recall",
        title: "卡组 deck-recall",
        cardCount: 2,
        activeCount: 1,
        archivedCount: 0,
        // 刚复习完的卡明天才到期；另一张是新卡 → 当前到期数为 0
        dueCount: 0,
      });
    });
  });

  // ---------- 读：卡组详情 ----------

  describe("GET /recall/decks/:deckKey", () => {
    it("limit=1 生效，meta.total 是卡组内卡片总数", async () => {
      await seedDeck();

      const res = await request("/recall/decks/deck-recall?limit=1&offset=0");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.deck).toEqual({
        deckKey: "deck-recall",
        title: "卡组 deck-recall",
        groups: [],
      });
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ cardKey: "c01", kind: "list" });
      expect(body.data[0].items).toHaveLength(2);
      expect(body.meta).toEqual({ limit: 1, offset: 0, total: 2 });
    });

    it("第二页拿到填空卡（offset 生效）", async () => {
      await seedDeck();
      const res = await request("/recall/decks/deck-recall?limit=1&offset=1");
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ cardKey: "c02", kind: "cloze" });
      expect(body.data[0].blanks).toHaveLength(2);
    });

    it("不存在的 deckKey → 404", async () => {
      const res = await request("/recall/decks/nope");
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain("卡组不存在");
    });
  });

  // ---------- 读：单卡详情 ----------

  describe("GET /recall/cards/:cardId", () => {
    it("新卡 mode=first、state=null", async () => {
      const ids = await seedDeck();
      const res = await request(`/recall/cards/${ids.get("c01")}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        cardId: ids.get("c01"),
        cardKey: "c01",
        deckKey: "deck-recall",
        kind: "list",
        mode: "first",
        state: null,
        pendingItems: null,
      });
    });

    it("该身份复习后有 state；另一个身份仍是 state=null（进度隔离）", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("c01");

      const review = await request("/recall/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度 开展安全演练" },
      });
      expect(review.status).toBe(200);

      const mine = await (await request(`/recall/cards/${cardId}`)).json();
      expect(mine.state).toMatchObject({ reps: 1, archived: false });
      expect(mine.state.due).toBeTruthy();

      // 另一个用户看到的是"自己的"状态：没有记录 → null
      const others = await (
        await request(`/recall/cards/${cardId}`, { key: OTHER_WRITE_KEY })
      ).json();
      expect(others.state).toBeNull();
      expect(others.mode).toBe("first");

      // 卡组详情里的 state 也必须按身份隔离
      const otherDeck = await (
        await request("/recall/decks/deck-recall?limit=10", {
          key: OTHER_WRITE_KEY,
        })
      ).json();
      expect(
        otherDeck.data.every((card: { state: unknown }) => card.state === null),
      ).toBe(true);
    });

    it("cardId 不是正整数 → 400；不存在 → 404", async () => {
      const bad = await request("/recall/cards/abc");
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toContain("正整数");

      const missing = await request("/recall/cards/999999");
      expect(missing.status).toBe(404);
      expect((await missing.json()).error).toContain("卡片不存在");
    });

    /** 直接写状态行：模拟「卡片被编辑过、库里的 pendingItems 已经过期」 */
    async function seedPendingState(cardId: number, pendingItems: string) {
      await testDbHelper.db.insert(schema.recall_card_states).values({
        user_id: WRITE_USER_ID,
        card_id: cardId,
        pending_items: pendingItems,
      });
    }

    it("失效下标被过滤后仍非空 → mode=retest 且只返回有效条目", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("c01") as number;
      await seedPendingState(cardId, "[1,9]");

      const res = await request(`/recall/cards/${cardId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.mode).toBe("retest");
      expect(body.pendingItems).toEqual([1]);
      expect(body.state.pendingItems).toEqual([1, 9]);
    });

    it("条目被缩到 1 条、pendingItems 全部越界 → mode=first 且清空", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("c01") as number;

      // 同一 cardKey 再提交 = 内容更新：条目 2 → 1，复习进度不受影响
      const edit = await request("/recall/cards", {
        method: "POST",
        body: {
          deckKey: "deck-recall",
          cardId: "c01",
          prompt: "c01 的题干",
          kind: "list",
          items: [{ text: "建立安全制度", keywords: ["安全制度"] }],
        },
      });
      expect(edit.status).toBe(200);
      await seedPendingState(cardId, "[7,9]");

      const res = await request(`/recall/cards/${cardId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.mode).toBe("first");
      expect(body.pendingItems).toBeNull();
    });
  });

  // ---------- 读：今日队列 ----------

  describe("GET /recall/queue", () => {
    it("新卡 fresh=min(卡片数, 6)，ids 长度 = total", async () => {
      // 8 张卡：每日新卡额度默认 6
      await importDeck(
        "deck-many",
        Array.from({ length: 8 }, (_, i) => listCard(`m${i}`)),
      );

      const res = await request("/recall/queue");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.fresh).toBe(6);
      expect(body.due).toBe(0);
      expect(body.total).toBe(6);
      expect(body.ids).toHaveLength(body.total);
      expect(body.streakDays).toBe(0);
      expect(body.estimatedMinutes).toBeGreaterThan(0);
    });

    it("首次作答后 streakDays=1，且今天不再投放新卡之外的东西", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("c01");
      await request("/recall/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度 开展安全演练" },
      });

      const body = await (await request("/recall/queue")).json();
      expect(body.streakDays).toBe(1);
      // 复习过的卡今天不重复出现：只剩那张没碰过的新卡
      expect(body.ids).not.toContain(cardId);
      expect(body.total).toBe(1);
    });
  });

  // ---------- 写：提交作答 ----------

  describe("POST /recall/reviews", () => {
    it("正常判分：verdicts/rating/nextReviewText 齐全，日志与状态落库", async () => {
      const ids = await seedDeck();
      const cardId = ids.get("c01");

      const res = await request("/recall/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度 开展安全演练" },
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

      expect(await countOf(schema.recall_review_logs)).toBe(1);
      expect(await countOf(schema.recall_card_states)).toBe(1);
    });

    it("有错时 pendingItems 非空，提示「明天只重测这 N 条」", async () => {
      const ids = await seedDeck();
      const res = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: ids.get("c01"), typed: "建立安全制度" },
      });
      const body = await res.json();

      expect(body.verdicts).toEqual(["ok", "miss"]);
      expect(body.rating).toBe("hard");
      expect(body.pendingItems).toEqual([1]);
      expect(body.nextReviewText).toBe("明天只重测这 1 条");
    });

    it("同一 clientKey 重试 → duplicate=true 且不二次推进调度", async () => {
      const ids = await seedDeck();
      const payload = {
        cardId: ids.get("c01"),
        typed: "建立安全制度 开展安全演练",
        clientKey: "client-key-idem",
      };

      const first = await request("/recall/reviews", {
        method: "POST",
        body: payload,
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.duplicate).toBe(false);

      const stateAfterFirst = (
        await testDbHelper.db.select().from(schema.recall_card_states)
      )[0];

      const second = await request("/recall/reviews", {
        method: "POST",
        body: payload,
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json();

      expect(secondBody.duplicate).toBe(true);
      expect(secondBody.nextDue).toBe(firstBody.nextDue);
      expect(secondBody.verdicts).toEqual(firstBody.verdicts);

      // 关键：只落一条日志，reps 不翻倍，下次到期时间不被二次推进
      expect(await countOf(schema.recall_review_logs)).toBe(1);
      const stateAfterSecond = (
        await testDbHelper.db.select().from(schema.recall_card_states)
      )[0];
      expect(stateAfterSecond.reps).toBe(stateAfterFirst.reps);
      expect(stateAfterSecond.reps).toBe(1);
      expect(stateAfterSecond.due).toBe(stateAfterFirst.due);
    });

    it("卡片不存在 → 404，且不写日志", async () => {
      const res = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: 424242, typed: "随便写点" },
      });
      expect(res.status).toBe(404);
      expect(await countOf(schema.recall_review_logs)).toBe(0);
    });

    it("改判下标非法 → 400（可读原因），不是 500", async () => {
      const ids = await seedDeck();
      const res = await request("/recall/reviews", {
        method: "POST",
        body: {
          cardId: ids.get("c01"),
          typed: "建立安全制度",
          overrides: [{ index: 9, to: "ok" }],
        },
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("改判");
      expect(await countOf(schema.recall_review_logs)).toBe(0);
    });

    it("缺少 typed → 400", async () => {
      const ids = await seedDeck();
      const res = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: ids.get("c01") },
      });
      expect(res.status).toBe(400);
    });
  });

  // ---------- 写：导入卡组 ----------

  describe("POST /recall/decks", () => {
    it("首次导入 conflicts=[]；再次导入 createdCards=0 且零新增", async () => {
      const first = await importDeck("deck-idem", [
        listCard("i1"),
        listCard("i2"),
      ]);
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody).toMatchObject({
        deckKey: "deck-idem",
        createdCards: 2,
        updatedCards: 0,
        skippedCards: 0,
        conflicts: [],
        missingInFile: [],
      });

      const second = await importDeck("deck-idem", [
        listCard("i1"),
        listCard("i2"),
      ]);
      const secondBody = await second.json();
      expect(secondBody).toMatchObject({
        createdCards: 0,
        updatedCards: 0,
        skippedCards: 2,
        conflicts: [],
      });

      expect(await countOf(schema.recall_decks)).toBe(1);
      expect(await countOf(schema.recall_cards)).toBe(2);
    });

    it("内容冲突默认 keep：updatedCards=0、conflicts 记 keep，进度不受影响", async () => {
      const ids = await seedDeck("deck-conflict");
      await request("/recall/reviews", {
        method: "POST",
        body: {
          cardId: ids.get("c01"),
          typed: "建立安全制度 开展安全演练",
        },
      });

      const changed = listCard("c01", {
        items: [
          { text: "改写后的条目", keywords: ["改写"] },
          { text: "开展安全演练", keywords: ["安全演练"] },
        ],
      });
      const res = await importDeck("deck-conflict", [
        changed,
        clozeCard("c02"),
      ]);
      const body = await res.json();

      expect(body.updatedCards).toBe(0);
      expect(body.conflicts).toEqual([{ cardId: "c01", action: "keep" }]);
      // 进度行没被导入碰过
      expect(await countOf(schema.recall_card_states)).toBe(1);
    });

    it("未知 schema 版本 → 400 且库内零写入", async () => {
      const res = await request("/recall/decks", {
        method: "POST",
        body: {
          json: JSON.stringify({
            schema: 2,
            deckId: "deck-v2",
            title: "未来版本",
            cards: [listCard("v1")],
          }),
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("校验失败");
      expect(body.issues.join()).toContain("schema=2");
      expect(await countOf(schema.recall_decks)).toBe(0);
      expect(await countOf(schema.recall_cards)).toBe(0);
    });

    it("内容校验失败（条目缺关键词）→ 400 带 issues", async () => {
      const res = await request("/recall/decks", {
        method: "POST",
        body: {
          json: deckJson("deck-bad", [
            {
              cardId: "b1",
              kind: "list",
              prompt: "坏卡",
              items: [{ text: "没有关键词", keywords: [] }],
            },
          ]),
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.issues.length).toBeGreaterThan(0);
      expect(body.issues.join()).toContain("keywords");
      expect(await countOf(schema.recall_cards)).toBe(0);
    });
  });

  // ---------- 写：建/改/删卡 ----------

  describe("POST /recall/cards 与 DELETE", () => {
    async function createCard(cardId = "api-c1") {
      return request("/recall/cards", {
        method: "POST",
        body: {
          deckKey: "deck-recall",
          cardId,
          prompt: "通过 API 建的卡",
          kind: "list",
          items: [{ text: "条目一", keywords: ["条目一"] }],
        },
      });
    }

    it("新建后出现在 GET /recall/decks/:deckKey，且可被取卡", async () => {
      await seedDeck();
      const res = await createCard();
      expect(res.status).toBe(200);

      const created = await res.json();
      expect(created.cardKey).toBe("api-c1");
      expect(Number.isInteger(created.cardId)).toBe(true);

      const detail = await (
        await request("/recall/decks/deck-recall?limit=10")
      ).json();
      expect(detail.meta.total).toBe(3);
      expect(
        detail.data.some(
          (card: { cardKey: string }) => card.cardKey === "api-c1",
        ),
      ).toBe(true);

      const card = await (
        await request(`/recall/cards/${created.cardId}`)
      ).json();
      expect(card).toMatchObject({
        cardKey: "api-c1",
        mode: "first",
        state: null,
      });
    });

    it("同 cardId 再提交 = 更新（不新增卡片）", async () => {
      await seedDeck();
      const first = await (await createCard()).json();
      const second = await (
        await request("/recall/cards", {
          method: "POST",
          body: {
            deckKey: "deck-recall",
            cardId: "api-c1",
            prompt: "改过的题干",
            kind: "list",
            items: [{ text: "条目一", keywords: ["条目一"] }],
          },
        })
      ).json();

      expect(second.cardId).toBe(first.cardId);
      expect(await countOf(schema.recall_cards)).toBe(3);
      const card = await (
        await request(`/recall/cards/${first.cardId}`)
      ).json();
      expect(card.prompt).toBe("改过的题干");
    });

    it("DELETE 后卡片消失（详情 404、卡组 total 回落）", async () => {
      await seedDeck();
      const created = await (await createCard()).json();

      const del = await request("/recall/decks/deck-recall/cards/api-c1", {
        method: "DELETE",
      });
      expect(del.status).toBe(200);
      expect(await del.json()).toEqual({
        cardId: created.cardId,
        cardKey: "api-c1",
        deleted: true,
      });

      expect((await request(`/recall/cards/${created.cardId}`)).status).toBe(
        404,
      );
      const detail = await (
        await request("/recall/decks/deck-recall?limit=10")
      ).json();
      expect(detail.meta.total).toBe(2);
      expect(await countOf(schema.recall_cards)).toBe(2);
    });

    it("删不存在的卡 / 卡组 → 404", async () => {
      await seedDeck();
      const missingCard = await request(
        "/recall/decks/deck-recall/cards/nope",
        {
          method: "DELETE",
        },
      );
      expect(missingCard.status).toBe(404);

      const missingDeck = await request("/recall/decks/nope/cards/c01", {
        method: "DELETE",
      });
      expect(missingDeck.status).toBe(404);
      expect(await countOf(schema.recall_cards)).toBe(2);
    });

    it("建卡到不存在的卡组 → 404", async () => {
      const res = await request("/recall/cards", {
        method: "POST",
        body: {
          deckKey: "deck-nope",
          cardId: "x1",
          prompt: "题干",
          kind: "list",
          items: [{ text: "条目", keywords: ["条目"] }],
        },
      });
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain("卡组不存在");
    });
  });

  // ---------- 请求体必填 ----------

  describe("写接口的 body 必填", () => {
    it.each([
      ["/recall/reviews", "cardId"],
      ["/recall/decks", "json"],
      ["/recall/cards", "deckKey"],
    ])(
      "%s 不带 body / Content-Type → 400 且指明缺失字段（不是 500）",
      async (path, missingField) => {
        const res = await request(path, { method: "POST" });
        expect(res.status).toBe(400);

        // zod 校验失败的默认响应：success=false，error.message 里列出缺失字段
        // （zod v4 的 ZodError 序列化只带 name + message）
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error?.name).toBe("ZodError");
        expect(typeof body.error?.message).toBe("string");
        expect(body.error.message).toContain(missingField);
      },
    );
  });

  // ---------- 权限 ----------

  describe("权限（scope）", () => {
    it("read key 调三个写接口均 403，且不产生任何数据", async () => {
      const ids = await seedDeck();

      const review = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: ids.get("c01"), typed: "建立安全制度" },
        key: READ_KEY,
      });
      expect(review.status).toBe(403);
      expect((await review.json()).error).toContain("write");

      const importRes = await importDeck(
        "deck-forbidden",
        [listCard("f1")],
        READ_KEY,
      );
      expect(importRes.status).toBe(403);

      const upsert = await request("/recall/cards", {
        method: "POST",
        body: {
          deckKey: "deck-recall",
          cardId: "forbidden",
          prompt: "题干",
          kind: "list",
          items: [{ text: "条目", keywords: ["条目"] }],
        },
        key: READ_KEY,
      });
      expect(upsert.status).toBe(403);

      const del = await request("/recall/decks/deck-recall/cards/c01", {
        method: "DELETE",
        key: READ_KEY,
      });
      expect(del.status).toBe(403);

      // 越权请求不得写入任何数据
      expect(await countOf(schema.recall_review_logs)).toBe(0);
      expect(await countOf(schema.recall_decks)).toBe(1);
      expect(await countOf(schema.recall_cards)).toBe(2);
    });

    it("write key 也能读（read 守卫是兜底，不是上限）", async () => {
      await seedDeck();
      expect((await request("/recall/decks", { key: WRITE_KEY })).status).toBe(
        200,
      );
      expect((await request("/recall/queue", { key: WRITE_KEY })).status).toBe(
        200,
      );
    });

    it("无 key → 401", async () => {
      const res = await request("/recall/decks", { key: null });
      expect(res.status).toBe(401);
    });
  });

  // ---------- 审计 ----------

  describe("审计（api_audit_logs）", () => {
    it("写接口成功调用后记一条，path/status/key_id 正确", async () => {
      const res = await importDeck("deck-audit", [listCard("a1")]);
      expect(res.status).toBe(200);

      const [keyRow] = await testDbHelper.db
        .select()
        .from(schema.api_keys)
        .where(eq(schema.api_keys.key_string, WRITE_KEY));

      // 审计走 after()（测试环境退化为即时异步），稍等它落库。
      // 只按 path 过滤：`after()` 的旁路写入可能比测试晚一拍，落到下一个用例的库上，
      // 全表计数会把残留行算进来（与被测行为无关）。
      await vi.waitFor(async () => {
        const rows = (await testDbHelper.db
          .select()
          .from(schema.api_audit_logs)) as Array<
          typeof schema.api_audit_logs.$inferSelect
        >;
        const matched = rows.filter(
          (row) =>
            row.path === "/api/external/recall/decks" && row.method === "POST",
        );
        expect(matched).toHaveLength(1);
        expect(matched[0]).toMatchObject({
          key_id: keyRow.id,
          user_id: WRITE_USER_ID,
          status: 200,
        });
      });
    });

    it("越权写（403）也留痕，status=403", async () => {
      const ids = await seedDeck();
      const res = await request("/recall/reviews", {
        method: "POST",
        body: { cardId: ids.get("c01"), typed: "建立安全制度" },
        key: READ_KEY,
      });
      expect(res.status).toBe(403);

      await vi.waitFor(async () => {
        const rows = (await testDbHelper.db
          .select()
          .from(schema.api_audit_logs)) as Array<
          typeof schema.api_audit_logs.$inferSelect
        >;
        const matched = rows.filter(
          (row) =>
            row.path === "/api/external/recall/reviews" &&
            row.method === "POST",
        );
        expect(matched).toHaveLength(1);
        expect(matched[0]).toMatchObject({
          status: 403,
          user_id: WRITE_USER_ID,
        });
      });
    });

    it("读接口不记审计", async () => {
      await seedDeck();
      // 先等前面用例的旁路写入落库，再取基线，避免把残留算成"读接口写的"
      await new Promise((resolve) => setTimeout(resolve, 100));
      const before = await countOf(schema.api_audit_logs);

      await request("/recall/decks");
      await request("/recall/queue");

      // 给 after() 留出时间，再断言"确实没写"
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await countOf(schema.api_audit_logs)).toBe(before);
    });
  });
});
