// @vitest-environment node
/**
 * 写接口 dry-run（docs/api.md §9）
 *
 * 验收口径（与计划文档一致，都是可复现的数字）：
 *   1. `dryRun=true` 返回的计数/评分与**真执行**完全一致；
 *   2. dry-run 之后相关表的行数不变（真的一行都没写）；
 *   3. dry-run 仍能暴露 400（题目不存在）与 404（卡片不在卡组里）这类业务错误 ——
 *      预演如果不能报错，agent 就会带着错误参数去真发请求。
 *
 * 实现走的是"真实事务 + 哨兵回滚"（services/dry-run.ts），所以 1 与 2 是同一条
 * 代码路径的两个观测面；如果哪天有人给预演单独写了一套逻辑，这组用例会先红。
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

const API_PREFIX = "/api/external";
const USER_ID = 7;

const WRITE_KEY = "dryrun-write-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(
  path: string,
  options: { method?: string; body?: unknown } = {},
) {
  const { method = "GET", body } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${WRITE_KEY}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function seedBase() {
  await testDbHelper.seedUser(USER_ID, "dryrun-user");
  await testDbHelper.db.insert(schema.api_keys).values({
    key_string: WRITE_KEY,
    is_active: 1,
    scopes: "write",
    user_id: USER_ID,
  });

  const inserted = await testDbHelper.db
    .insert(schema.questions)
    .values([
      {
        content: "秦朝统一六国的年份？",
        options: JSON.stringify(["A", "B"]),
        answer: "A",
        tags: JSON.stringify(["历史"]),
        type: "single",
      },
      {
        content: "长江发源于哪座山脉？",
        options: JSON.stringify(["A", "B"]),
        answer: "B",
        tags: JSON.stringify(["地理"]),
        type: "single",
      },
    ])
    .returning({ id: schema.questions.id });

  return inserted.map((row: { id: number }) => row.id);
}

async function countRows(table: unknown): Promise<number> {
  const rows = (await testDbHelper.db
    .select()
    .from(table as never)) as unknown[];
  return rows.length;
}

/** 5 张写接口会碰到的表：dry-run 前后必须逐张相等 */
async function tableCounts() {
  return {
    sessions: await countRows(schema.practice_sessions),
    logs: await countRows(schema.practice_logs),
    decks: await countRows(schema.recall_decks),
    cards: await countRows(schema.recall_cards),
    reviewLogs: await countRows(schema.recall_review_logs),
    cardStates: await countRows(schema.recall_card_states),
    mastery: await countRows(schema.user_mastery),
  };
}

// ---------- recall 夹具（与 external-recall.test.ts 同格式） ----------

function listCard(cardId: string) {
  return {
    cardId,
    kind: "list",
    prompt: `${cardId} 的题干`,
    items: [
      { text: "建立安全制度", keywords: ["安全制度"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
    ],
    verbatim: false,
  };
}

function deckJson(deckId: string, cards: unknown[]): string {
  return JSON.stringify({
    schema: 1,
    deckId,
    title: `卡组 ${deckId}`,
    groups: [],
    cards,
  });
}

async function importDeck(deckId: string, dryRun: boolean) {
  return request(`/recall/decks${dryRun ? "?dryRun=true" : ""}`, {
    method: "POST",
    body: { json: deckJson(deckId, [listCard("c01"), listCard("c02")]) },
  });
}

/** 建好卡组并把卡片主键按 cardKey 返回 */
async function seedDeck(deckId = "deck-dry"): Promise<Map<string, number>> {
  const res = await importDeck(deckId, false);
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

describe("写接口 dry-run", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== POST /practice/answers ====================

  describe("POST /practice/answers", () => {
    it("预演计数与真执行一致，且库内零写入", async () => {
      const [q1, q2] = await seedBase();
      const payload = {
        sessionKey: "dry-session-1",
        sessionName: "预演会话",
        answers: [
          { questionId: q1, userAnswer: "A", isCorrect: true },
          { questionId: q2, userAnswer: "A", isCorrect: false },
          { questionId: q1, userAnswer: "A", isCorrect: true },
        ],
      };

      const before = await tableCounts();

      const dry = await request("/practice/answers?dryRun=true", {
        method: "POST",
        body: payload,
      });
      expect(dry.status).toBe(200);
      const dryBody = await dry.json();
      expect(dryBody).toMatchObject({
        inserted: 3,
        duplicated: false,
        dryRun: true,
      });

      // 一行都没写：会话/日志/掌握度都必须与预演前逐项相等
      expect(await tableCounts()).toEqual(before);

      const real = await request("/practice/answers", {
        method: "POST",
        body: payload,
      });
      expect(real.status).toBe(200);
      const realBody = await real.json();
      expect(realBody.inserted).toBe(dryBody.inserted);
      expect(realBody.dryRun).toBeUndefined();

      const after = await tableCounts();
      expect(after.sessions).toBe(before.sessions + 1);
      expect(after.logs).toBe(before.logs + 3);
      // 掌握度按 tag 累加，历史 2 条 + 地理 1 条 → 至少写了两行
      expect(after.mastery).toBeGreaterThan(before.mastery);
    });

    it("幂等命中时预演也带 dryRun（与真重放可区分）", async () => {
      const [q1] = await seedBase();
      const payload = {
        sessionKey: "dry-session-idem",
        answers: [{ questionId: q1, isCorrect: true }],
      };

      const real = await request("/practice/answers", {
        method: "POST",
        body: payload,
      });
      expect(real.status).toBe(200);

      const replayDry = await request("/practice/answers?dryRun=true", {
        method: "POST",
        body: payload,
      });
      const body = await replayDry.json();
      expect(body.duplicated).toBe(true);
      expect(body.dryRun).toBe(true);
    });

    it("预演仍会以 400 暴露不存在的 questionId，且不写任何行", async () => {
      const [q1] = await seedBase();
      const before = await tableCounts();

      const res = await request("/practice/answers?dryRun=true", {
        method: "POST",
        body: {
          sessionKey: "dry-session-bad",
          answers: [{ questionId: q1, isCorrect: true }],
        },
      });
      // 用真实存在的题，再夹一个不存在的 id：整批必须被拒
      const bad = await request("/practice/answers?dryRun=true", {
        method: "POST",
        body: {
          sessionKey: "dry-session-bad-2",
          answers: [
            { questionId: q1, isCorrect: true },
            { questionId: 999999, isCorrect: false },
          ],
        },
      });

      expect(res.status).toBe(200);
      expect(bad.status).toBe(400);
      const body = await bad.json();
      expect(body.invalidQuestionIds).toEqual([999999]);
      expect(await tableCounts()).toEqual(before);
    });
  });

  // ==================== POST /recall/decks ====================

  describe("POST /recall/decks", () => {
    it("首次导入：预演报告 2 张新建，但库内既无卡组也无卡", async () => {
      await seedBase();
      const before = await tableCounts();

      const dry = await importDeck("deck-first", true);
      expect(dry.status).toBe(200);
      const dryBody = await dry.json();
      expect(dryBody).toMatchObject({
        createdCards: 2,
        updatedCards: 0,
        skippedCards: 0,
        dryRun: true,
      });
      expect(await tableCounts()).toEqual(before);

      const real = await importDeck("deck-first", false);
      const realBody = await real.json();
      expect(realBody.createdCards).toBe(dryBody.createdCards);
      expect(realBody.dryRun).toBeUndefined();
      expect(await countRows(schema.recall_decks)).toBe(1);
      expect(await countRows(schema.recall_cards)).toBe(2);
    });

    it("重复导入：预演报 0 新建 / 2 跳过，与真执行一致且不动库", async () => {
      await seedBase();
      await importDeck("deck-again", false);

      const before = await tableCounts();
      const dry = await importDeck("deck-again", true);
      const dryBody = await dry.json();
      expect(dryBody).toMatchObject({
        createdCards: 0,
        updatedCards: 0,
        skippedCards: 2,
        dryRun: true,
      });
      expect(await tableCounts()).toEqual(before);

      const real = await importDeck("deck-again", false);
      const realBody = await real.json();
      expect(realBody).toMatchObject({
        createdCards: dryBody.createdCards,
        skippedCards: dryBody.skippedCards,
      });
    });
  });

  // ==================== POST /recall/cards ====================

  describe("POST /recall/cards", () => {
    it("预演建卡报告 created=true 但不落库；真建才多一行", async () => {
      await seedBase();
      const ids = await seedDeck("deck-upsert");
      expect(ids.size).toBe(2);

      const before = await tableCounts();
      const card = {
        deckKey: "deck-upsert",
        cardId: "c03",
        prompt: "预演新建的卡",
        kind: "list" as const,
        items: [{ text: "条目一", keywords: ["条目一"] }],
      };

      const dry = await request("/recall/cards?dryRun=true", {
        method: "POST",
        body: card,
      });
      expect(dry.status).toBe(200);
      const dryBody = await dry.json();
      expect(dryBody).toMatchObject({ created: true, dryRun: true });
      expect(await tableCounts()).toEqual(before);

      const real = await request("/recall/cards", {
        method: "POST",
        body: card,
      });
      const realBody = await real.json();
      expect(realBody.created).toBe(true);
      expect(realBody.dryRun).toBeUndefined();
      expect(await countRows(schema.recall_cards)).toBe(before.cards + 1);
    });

    it("预演改卡报告 created=false，且旧内容不被覆盖", async () => {
      await seedBase();
      await seedDeck("deck-update");

      const before = await tableCounts();
      const dry = await request("/recall/cards?dryRun=true", {
        method: "POST",
        body: {
          deckKey: "deck-update",
          cardId: "c01",
          prompt: "被预演改过的题干",
          kind: "list",
          items: [{ text: "新条目", keywords: ["新条目"] }],
        },
      });
      expect(dry.status).toBe(200);
      expect(await dry.json()).toMatchObject({ created: false, dryRun: true });

      // 内容没被覆盖：库里仍是原来的题干
      const [row] = await testDbHelper.db
        .select()
        .from(schema.recall_cards)
        .where(eq(schema.recall_cards.card_key, "c01"));
      expect(row.prompt).toBe("c01 的题干");
      expect(await tableCounts()).toEqual(before);
    });
  });

  // ==================== DELETE /recall/decks/:deckKey/cards/:cardKey ====================

  describe("DELETE /recall/decks/{deckKey}/cards/{cardKey}", () => {
    it("预演给出将删除的日志/进度计数，卡片仍在；真删命中同一组数字", async () => {
      await seedBase();
      const ids = await seedDeck("deck-delete");
      const cardId = ids.get("c01")!;

      // 先真复习一次，制造 1 条日志 + 1 行进度
      const review = await request("/recall/reviews", {
        method: "POST",
        body: { cardId, typed: "建立安全制度 开展安全演练" },
      });
      expect(review.status).toBe(200);

      const before = await tableCounts();

      const dry = await request(
        `/recall/decks/deck-delete/cards/c01?dryRun=true`,
        { method: "DELETE" },
      );
      expect(dry.status).toBe(200);
      const dryBody = await dry.json();
      expect(dryBody).toMatchObject({
        cardKey: "c01",
        deleted: false,
        reviewLogs: 1,
        cardStates: 1,
        dryRun: true,
      });
      // 卡、日志、进度都还在
      expect(await tableCounts()).toEqual(before);

      const real = await request(`/recall/decks/deck-delete/cards/c01`, {
        method: "DELETE",
      });
      const realBody = await real.json();
      expect(realBody).toMatchObject({
        deleted: true,
        reviewLogs: dryBody.reviewLogs,
        cardStates: dryBody.cardStates,
      });
      const after = await tableCounts();
      expect(after.cards).toBe(before.cards - 1);
      expect(after.reviewLogs).toBe(before.reviewLogs - 1);
      expect(after.cardStates).toBe(before.cardStates - 1);
    });

    it("预演也走 404 语义：卡片不在该卡组里仍然报 404", async () => {
      await seedBase();
      await seedDeck("deck-404");

      const res = await request(
        `/recall/decks/deck-404/cards/not-exist?dryRun=true`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(404);
    });
  });

  // ==================== POST /recall/reviews ====================

  describe("POST /recall/reviews", () => {
    it("预演返回的评分与到期时间与真提交一致，且不写日志/进度", async () => {
      // 锁时钟：`submitReview` 的 reviewedAt 截到秒，两次请求跨秒时调度基线不同，
      // nextDue 即使评分一致也会差一天——那会让这条用例偶发失败
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-18T08:00:00.000Z"));
      try {
        await seedBase();
        const ids = await seedDeck("deck-review");
        const cardId = ids.get("c01")!;
        const before = await tableCounts();

        const dry = await request("/recall/reviews?dryRun=true", {
          method: "POST",
          body: { cardId, typed: "建立安全制度 开展安全演练" },
        });
        expect(dry.status).toBe(200);
        const dryBody = await dry.json();
        expect(dryBody.dryRun).toBe(true);
        expect(dryBody.verdicts).toEqual(["ok", "ok"]);
        expect(await tableCounts()).toEqual(before);

        const real = await request("/recall/reviews", {
          method: "POST",
          body: { cardId, typed: "建立安全制度 开展安全演练" },
        });
        const realBody = await real.json();
        expect(realBody.rating).toBe(dryBody.rating);
        expect(realBody.nextDue).toBe(dryBody.nextDue);
        expect(realBody.pendingItems).toEqual(dryBody.pendingItems);
        expect(realBody.dryRun).toBeUndefined();

        const after = await tableCounts();
        expect(after.reviewLogs).toBe(before.reviewLogs + 1);
        expect(after.cardStates).toBe(before.cardStates + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("预演的幂等重放语义与真提交一致：同 clientKey 第二次是 duplicate", async () => {
      await seedBase();
      const ids = await seedDeck("deck-idem");
      const cardId = ids.get("c01")!;

      const first = await request("/recall/reviews", {
        method: "POST",
        body: {
          cardId,
          typed: "建立安全制度 开展安全演练",
          clientKey: "ck-dry-1",
        },
      });
      expect(first.status).toBe(200);

      const replay = await request("/recall/reviews?dryRun=true", {
        method: "POST",
        body: {
          cardId,
          typed: "建立安全制度 开展安全演练",
          clientKey: "ck-dry-1",
        },
      });
      const body = await replay.json();
      // 命中重放时不写库，但仍要带 dryRun：否则调用方分不清"预演的重放"
      // 与"普通的重放"，判定逻辑会随调用顺序漂移
      expect(body.duplicate).toBe(true);
      expect(body.dryRun).toBe(true);
    });
  });
});
