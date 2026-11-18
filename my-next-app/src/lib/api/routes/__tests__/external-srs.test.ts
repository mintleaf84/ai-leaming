// @vitest-environment node
/**
 * 外部 API：写侧闭环（归档 / 取消归档 / 错题 SRS 推进）
 *
 * 这一组是「agent 能不能推动学习循环」的关键：
 *   建卡（已有）→ 复习（已有）→ **错题进复习队列**（本文件）→ 归档退出队列（本文件）。
 *
 * 幂等口径：归档/取消归档天然幂等；`/srs/reviews` 用 `answeredAt` 当幂等键
 * （复习本来就是"一个时间点一条"），同一时间重试不二次推进调度。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
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
const A = 31;
const B = 32;
const KEY = "srs-write-key";
const KEY_B = "srs-write-key-b";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const { method = "GET", body, key = KEY } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${key}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function seed() {
  await testDbHelper.seedUser(A, "srs-a");
  await testDbHelper.seedUser(B, "srs-b");
  await testDbHelper.db.insert(schema.api_keys).values([
    { key_string: KEY, is_active: 1, scopes: "write", user_id: A },
    { key_string: KEY_B, is_active: 1, scopes: "write", user_id: B },
  ]);

  const [question] = await testDbHelper.db
    .insert(schema.questions)
    .values({
      content: "教育学的首要问题是？",
      options: JSON.stringify(["A. 教育目的", "B. 教育方法"]),
      answer: "A",
      type: "single",
      tags: JSON.stringify(["教育学"]),
    })
    .returning({ id: schema.questions.id });

  const [deck] = await testDbHelper.db
    .insert(schema.recall_decks)
    .values({ deck_key: "deck-srs", title: "SRS 卡组", owner_user_id: A })
    .returning({ id: schema.recall_decks.id });

  const [card] = await testDbHelper.db
    .insert(schema.recall_cards)
    .values({
      deck_id: deck.id,
      card_key: "c-srs",
      kind: "list",
      prompt: "列举两条",
      items_json: JSON.stringify([
        { text: "条目一", keywords: ["条目一"] },
        { text: "条目二", keywords: ["条目二"] },
      ]),
      verbatim: 0,
      // prompt_hash 是 NOT NULL：内容指纹由业务侧计算，测试里给一个固定值即可
      prompt_hash: "test-hash-c-srs",
    })
    .returning({ id: schema.recall_cards.id });

  return { questionId: question.id, cardId: card.id };
}

describe("写侧闭环：归档与 SRS 推进", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== 归档 ====================

  describe("POST /recall/cards/{cardId}/archive", () => {
    it("归档只写当前身份的进度行，且重复归档仍成功", async () => {
      const { cardId } = await seed();

      const first = await request(`/recall/cards/${cardId}/archive`, {
        method: "POST",
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ cardId, archived: true });

      const again = await request(`/recall/cards/${cardId}/archive`, {
        method: "POST",
      });
      expect(again.status).toBe(200);

      const rows = await testDbHelper.db
        .select()
        .from(schema.recall_card_states)
        .where(
          and(
            eq(schema.recall_card_states.user_id, A),
            eq(schema.recall_card_states.card_id, cardId),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].archived).toBe(1);

      // 别人的队列不受影响：B 没有任何状态行
      const bRows = await testDbHelper.db
        .select()
        .from(schema.recall_card_states)
        .where(eq(schema.recall_card_states.user_id, B));
      expect(bRows).toHaveLength(0);
    });

    it("卡片不存在返回 404", async () => {
      await seed();
      const res = await request("/recall/cards/999999/archive", {
        method: "POST",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /recall/cards/{cardId}/archive", () => {
    it("取消归档把卡片放回队列；没归档过时 restored=false 而不是报错", async () => {
      const { cardId } = await seed();

      await request(`/recall/cards/${cardId}/archive`, { method: "POST" });

      const restored = await request(`/recall/cards/${cardId}/archive`, {
        method: "DELETE",
      });
      expect(restored.status).toBe(200);
      expect(await restored.json()).toEqual({ cardId, restored: true });

      // 没复习过的归档行在取消时会被整行删除（回到"从未复习"的状态，
      // 而不是留一条 archived=0、reps=0 的空壳）
      const rows = await testDbHelper.db
        .select()
        .from(schema.recall_card_states)
        .where(eq(schema.recall_card_states.card_id, cardId));
      expect(rows).toHaveLength(0);

      // 再删一次：没有可恢复的状态（reps=0 且没复习过 → 行已被删掉）
      const again = await request(`/recall/cards/${cardId}/archive`, {
        method: "DELETE",
      });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ cardId, restored: false });
    });
  });

  // ==================== SRS 推进 ====================

  describe("POST /srs/reviews", () => {
    it("推进调度：写入 question_srs 并返回到期时间", async () => {
      const { questionId } = await seed();

      const res = await request("/srs/reviews", {
        method: "POST",
        body: {
          questionId,
          isCorrect: false,
          answeredAt: "2026-11-18T08:00:00Z",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toMatchObject({ questionId, duplicate: false, reps: 1 });
      expect(typeof body.dueDate).toBe("string");
      expect(Number.isNaN(Date.parse(body.dueDate))).toBe(false);

      const [row] = await testDbHelper.db
        .select()
        .from(schema.question_srs)
        .where(
          and(
            eq(schema.question_srs.user_id, A),
            eq(schema.question_srs.question_id, questionId),
          ),
        );
      expect(row).toBeTruthy();
      expect(row.due_date).toBe(body.dueDate);
    });

    it("同一 answeredAt 重试是幂等重放：reps 不再增加", async () => {
      const { questionId } = await seed();
      const payload = {
        questionId,
        isCorrect: true,
        durationMs: 8000,
        answeredAt: "2026-11-18T08:00:00Z",
      };

      const first = await (
        await request("/srs/reviews", { method: "POST", body: payload })
      ).json();
      const replay = await (
        await request("/srs/reviews", { method: "POST", body: payload })
      ).json();

      expect(replay.duplicate).toBe(true);
      expect(replay.reps).toBe(first.reps);
      expect(replay.dueDate).toBe(first.dueDate);
    });

    it("换一个 answeredAt 就是新的一次复习，reps 递增", async () => {
      const { questionId } = await seed();

      const first = await (
        await request("/srs/reviews", {
          method: "POST",
          body: {
            questionId,
            isCorrect: true,
            answeredAt: "2026-11-18T08:00:00Z",
          },
        })
      ).json();

      const second = await (
        await request("/srs/reviews", {
          method: "POST",
          body: {
            questionId,
            isCorrect: true,
            answeredAt: "2026-11-19T08:00:00Z",
          },
        })
      ).json();

      expect(second.duplicate).toBe(false);
      expect(second.reps).toBe(first.reps + 1);
    });

    it("题目不存在返回 404；非法 answeredAt 返回 400", async () => {
      await seed();

      const missing = await request("/srs/reviews", {
        method: "POST",
        body: { questionId: 999999, isCorrect: true },
      });
      expect(missing.status).toBe(404);

      const badTime = await request("/srs/reviews", {
        method: "POST",
        body: { questionId: 1, isCorrect: true, answeredAt: "not-a-date" },
      });
      expect(badTime.status).toBe(400);
    });

    it("调度只落在调用身份上：A 的复习不影响 B 的 SRS 概览", async () => {
      const { questionId } = await seed();

      await request("/srs/reviews", {
        method: "POST",
        body: { questionId, isCorrect: false },
      });

      const mine = await (await request("/srs/summary")).json();
      expect(mine.totalCards).toBe(1);

      const others = await (
        await request("/srs/summary", { key: KEY_B })
      ).json();
      expect(others.totalCards).toBe(0);
    });
  });
});
