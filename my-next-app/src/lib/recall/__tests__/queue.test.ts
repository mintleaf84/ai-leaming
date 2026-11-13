// @vitest-environment node
/**
 * 每日队列（规格 §3 / §6 验收 6）——真实 SQLite，不 mock SQL。
 *
 * 断言的是**口径**而不是实现：
 * - 新卡额度：默认 6、硬上限 15（用户可调 0–15）；
 * - 当日总量上限 15，到期优先；
 * - 归档卡与未到期卡不进队列；
 * - 「今日已复习」按 Asia/Shanghai 04:00 的学习日窗口计数（不用 now - 24h）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { RecallCard, RecallListCard } from "../../recall/types";

const dbFile = `test-recall-queue-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type ImportModule = typeof import("../../services/recall-import");
type QueueModule = typeof import("../../recall/queue");

let dbm: DbModule;
let importDeck: ImportModule["importDeck"];
let buildDailyQueue: QueueModule["buildDailyQueue"];
let clampNewLimit: QueueModule["clampNewLimit"];
let getStudyDayStart: typeof import("../../recall/study-day").getStudyDayStart;

/** 固定"现在"：UTC 02:00 = 北京 10:00，学习日为 2026-11-13 */
const NOW = new Date("2026-11-13T02:00:00.000Z");
/** 学习日窗口左边界（北京 04:00 = UTC 前一天 20:00） */
const DAY_START = "2026-11-12T20:00:00.000Z";

let nextUserId = 500;

function listCard(cardId: string): RecallListCard {
  return {
    cardId,
    kind: "list",
    prompt: `题干 ${cardId}`,
    items: [{ text: "安全制度", keywords: ["安全制度"] }],
    verbatim: false,
  };
}

/** 建一个用户 + 一个独立卡组，返回该卡组所有卡片的数据库 id（升序） */
async function seedDeck(
  count: number,
  tag: string,
): Promise<{ userId: number; cardIds: number[] }> {
  const userId = nextUserId;
  nextUserId += 1;

  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values({ id: userId, username: `queue-user-${userId}`, password_hash: "x" })
    .onConflictDoNothing();

  const cards: RecallCard[] = [];
  for (let index = 0; index < count; index += 1) {
    cards.push(listCard(`${tag}-c${String(index).padStart(2, "0")}`));
  }

  await importDeck(userId, {
    schema: 1,
    deckId: `deck-${tag}`,
    title: `队列测试 ${tag}`,
    groups: [],
    cards,
  });

  const [deck] = await dbm.drizzleDb
    .select({ id: dbm.drizzleSchema.recall_decks.id })
    .from(dbm.drizzleSchema.recall_decks)
    .where(eq(dbm.drizzleSchema.recall_decks.deck_key, `deck-${tag}`))
    .limit(1);

  const rows = await dbm.drizzleDb
    .select({ id: dbm.drizzleSchema.recall_cards.id })
    .from(dbm.drizzleSchema.recall_cards)
    .where(eq(dbm.drizzleSchema.recall_cards.deck_id, deck.id));

  return {
    userId,
    cardIds: rows.map((row) => row.id).sort((a, b) => a - b),
  };
}

/** 给这些卡写状态行（due 已过期），第 index 张的 due 依次往后 1 天 */
async function markDue(
  userId: number,
  cardIds: number[],
  options: { archived?: boolean; dueOffsetDays?: number } = {},
): Promise<void> {
  const values = cardIds.map((cardId, index) => ({
    user_id: userId,
    card_id: cardId,
    due: new Date(
      NOW.getTime() - (options.dueOffsetDays ?? 1) * 864e5 + index * 60_000,
    ).toISOString(),
    stability: 3,
    difficulty: 5,
    state: 2,
    reps: 2,
    lapses: 0,
    last_review: new Date(NOW.getTime() - 3 * 864e5).toISOString(),
    archived: options.archived ? 1 : 0,
  }));
  if (values.length > 0) {
    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.recall_card_states)
      .values(values);
  }
}

describe("clampNewLimit", () => {
  it("缺省 6，硬上限 15，负数夹到 0", () => {
    expect(clampNewLimit(undefined)).toBe(6);
    expect(clampNewLimit(null)).toBe(6);
    expect(clampNewLimit(3)).toBe(3);
    expect(clampNewLimit(6)).toBe(6);
    expect(clampNewLimit(99)).toBe(15);
    expect(clampNewLimit(-3)).toBe(0);
    expect(clampNewLimit(Number.NaN)).toBe(6);
  });
});

/**
 * 每个用例前清空回忆相关表：新卡池是**全局内容**，前一个用例导入的卡片对后一个
 * 用例的新用户来说也是"新卡"，不清空就无法断言精确的队列。只清 recall_* 四张表
 * （用户表保留，避免 FK 反复重建）。
 */
async function resetRecallTables(): Promise<void> {
  const {
    recall_review_logs,
    recall_card_states,
    recall_cards,
    recall_decks,
  } = dbm.drizzleSchema;
  await dbm.drizzleDb.delete(recall_review_logs);
  await dbm.drizzleDb.delete(recall_card_states);
  await dbm.drizzleDb.delete(recall_cards);
  await dbm.drizzleDb.delete(recall_decks);
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  const importModule = await import("../../services/recall-import");
  importDeck = importModule.importDeck;

  const queueModule = await import("../../recall/queue");
  buildDailyQueue = queueModule.buildDailyQueue;
  clampNewLimit = queueModule.clampNewLimit;

  const studyDay = await import("../../recall/study-day");
  getStudyDayStart = studyDay.getStudyDayStart;
});

beforeEach(async () => {
  await resetRecallTables();
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

describe("buildDailyQueue", () => {

  it("新卡额度 6：只投 6 张，按 card id 升序", async () => {
    const { userId, cardIds } = await seedDeck(10, "fresh6");

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toEqual([]);
    expect(queue.fresh).toHaveLength(6);
    expect(queue.fresh).toEqual(cardIds.slice(0, 6));
    expect(queue.total).toBe(6);
    // ceil(6 * 0.4) = 3
    expect(queue.estimatedMinutes).toBe(3);
  });

  it("新卡额度 99 被夹到硬上限 15", async () => {
    const { userId } = await seedDeck(20, "fresh99");
    const queue = await buildDailyQueue(userId, { newLimit: 99, now: NOW });
    expect(queue.fresh).toHaveLength(15);
  });

  it("新卡额度 0：一张都不投", async () => {
    const { userId } = await seedDeck(3, "fresh0");
    const queue = await buildDailyQueue(userId, { newLimit: 0, now: NOW });
    expect(queue.fresh).toEqual([]);
    expect(queue.total).toBe(0);
    expect(queue.estimatedMinutes).toBe(0);
  });

  it("到期卡全取但不多于 15，且吃掉全部额度（新卡为 0）", async () => {
    const { userId, cardIds } = await seedDeck(20, "due20");
    await markDue(userId, cardIds);

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toHaveLength(15);
    expect(queue.due).toEqual(cardIds.slice(0, 15));
    expect(queue.fresh).toEqual([]);
    expect(queue.total).toBe(15);
  });

  it("到期优先：due 12 + 新卡额度 6 → 新卡只补 3 张", async () => {
    const { userId, cardIds } = await seedDeck(15, "mix12");
    await markDue(userId, cardIds.slice(0, 12));

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toEqual(cardIds.slice(0, 12));
    expect(queue.fresh).toHaveLength(3);
    expect(queue.fresh).toEqual(cardIds.slice(12, 15));
    expect(queue.total).toBe(15);
  });

  it("due 3 + 新卡额度 6 → 两者都拿满（不互相挤占）", async () => {
    const { userId, cardIds } = await seedDeck(12, "mix3");
    await markDue(userId, cardIds.slice(0, 3));

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toEqual(cardIds.slice(0, 3));
    expect(queue.fresh).toHaveLength(6);
    expect(queue.total).toBe(9);
    // ceil(9 * 0.4) = 4
    expect(queue.estimatedMinutes).toBe(4);
  });

  it("未到期卡与归档卡都不进队列", async () => {
    const { userId, cardIds } = await seedDeck(4, "excluded");
    // 前两张今天不 due（明天才 due）
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values(
      cardIds.slice(0, 2).map((cardId) => ({
        user_id: userId,
        card_id: cardId,
        due: new Date(NOW.getTime() + 864e5).toISOString(),
        state: 2,
      })),
    );
    // 第三张归档
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: userId,
      card_id: cardIds[2],
      due: new Date(NOW.getTime() - 864e5).toISOString(),
      state: 2,
      archived: 1,
    });

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toEqual([]);
    // 只有第 4 张是"没有状态行"的新卡
    expect(queue.fresh).toEqual([cardIds[3]]);
  });

  it("今日已复习消耗额度：10 条今天的日志 → 只剩 5 个名额", async () => {
    const { userId, cardIds } = await seedDeck(20, "budget");
    await markDue(userId, cardIds.slice(0, 2));

    const logRows = cardIds.slice(2, 12).map((cardId, index) => ({
      user_id: userId,
      card_id: cardId,
      ts: new Date(new Date(DAY_START).getTime() + (index + 1) * 60_000).toISOString(),
      mode: "first" as const,
      derived_rating: "good",
    }));
    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.recall_review_logs)
      .values(logRows);

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toHaveLength(2);
    expect(queue.fresh).toHaveLength(3);
    expect(queue.total).toBe(5);
  });

  it("跨学习日：昨天（04:00 之前）的日志不占今天的额度", async () => {
    const { userId, cardIds } = await seedDeck(10, "yesterday");
    await markDue(userId, cardIds.slice(0, 2));

    // 学习日左边界前 1 秒 = 昨天
    const yesterday = new Date(
      new Date(getStudyDayStart("2026-11-13").toISOString()).getTime() - 1000,
    ).toISOString();
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_review_logs).values({
      user_id: userId,
      card_id: cardIds[5],
      ts: yesterday,
      mode: "first",
      derived_rating: "good",
    });

    const queue = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(queue.due).toHaveLength(2);
    // 额度未被占用：新卡仍拿满 6
    expect(queue.fresh).toHaveLength(6);
  });

  it("队列是纯查询：同一时刻重复调用结果一致", async () => {
    const { userId, cardIds } = await seedDeck(10, "idempotent");
    await markDue(userId, cardIds.slice(0, 4));

    const first = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    const second = await buildDailyQueue(userId, { newLimit: 6, now: NOW });
    expect(second).toEqual(first);
  });

  it("另一个用户的状态不影响本用户队列（按用户隔离）", async () => {
    const a = await seedDeck(3, "iso-a");
    const b = await seedDeck(3, "iso-b");
    await markDue(a.userId, a.cardIds);

    const queueA = await buildDailyQueue(a.userId, { newLimit: 6, now: NOW });
    expect(queueA.due).toEqual(a.cardIds);

    // B 没有任何状态行：B 的 due 为空；A 的到期卡对 B 来说是**新卡**
    // （卡片内容是全局共享的，进度才按用户隔离）
    const queueB = await buildDailyQueue(b.userId, { newLimit: 6, now: NOW });
    expect(queueB.due).toEqual([]);
    expect(queueB.fresh).toEqual(expect.arrayContaining(b.cardIds));
  });
});
