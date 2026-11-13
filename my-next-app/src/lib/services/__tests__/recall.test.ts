// @vitest-environment node
/**
 * 回忆自测服务层 P2（真实 SQLite + 真实迁移，不 mock SQL）。
 *
 * 覆盖任务书要求的三类硬约束：
 * 1. 判分 → 评分 → 调度的完整链路（含改判、「全没想起」、重测）；
 * 2. **一个事务**：日志与状态要么同时落库，要么都不落（用触发器模拟状态写入失败）；
 * 3. 幂等：同一 (user, card, 秒) 重复提交不重复写日志、不重复推进状态。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { RecallCard, RecallClozeCard, RecallListCard } from "../../recall/types";

const dbFile = `test-recall-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type ImportModule = typeof import("../recall-import");
type ServiceModule = typeof import("../recall");

let dbm: DbModule;
let importDeck: ImportModule["importDeck"];
let submitReview: ServiceModule["submitReview"];
let getCard: ServiceModule["getCard"];
let getTodayQueue: ServiceModule["getTodayQueue"];
let archiveCard: ServiceModule["archiveCard"];
let unarchiveCard: ServiceModule["unarchiveCard"];
let RecallServiceError: ServiceModule["RecallServiceError"];

const USER_A = 700;
const USER_B = 701;

/** 固定"现在"：UTC 02:00 = 北京 10:00 */
const NOW = new Date("2026-11-13T02:00:00.000Z");

function listCard(cardId: string, overrides: Partial<RecallListCard> = {}): RecallListCard {
  return {
    cardId,
    kind: "list",
    prompt: `题干 ${cardId}`,
    items: [
      { text: "建立安全制度和应急机制", keywords: ["安全制度", "应急机制"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
      { text: "及时救助受伤学生", keywords: ["救助"] },
    ],
    verbatim: false,
    ...overrides,
  };
}

function clozeCard(cardId: string): RecallClozeCard {
  return {
    cardId,
    kind: "cloze",
    prompt: "学校不得使未成年学生在【　】的校舍中活动。",
    blanks: [
      { answers: ["危及人身安全、健康", "危及人身安全"] },
      { answers: ["教育教学设施"] },
    ],
  };
}

async function seedDeck(
  tag: string,
  cards: RecallCard[],
  userId: number = USER_A,
): Promise<Map<string, number>> {
  await importDeck(userId, {
    schema: 1,
    deckId: `deck-${tag}`,
    title: `服务测试 ${tag}`,
    groups: [],
    cards,
  });

  const [deck] = await dbm.drizzleDb
    .select({ id: dbm.drizzleSchema.recall_decks.id })
    .from(dbm.drizzleSchema.recall_decks)
    .where(eq(dbm.drizzleSchema.recall_decks.deck_key, `deck-${tag}`))
    .limit(1);

  const rows = await dbm.drizzleDb
    .select({
      id: dbm.drizzleSchema.recall_cards.id,
      key: dbm.drizzleSchema.recall_cards.card_key,
    })
    .from(dbm.drizzleSchema.recall_cards)
    .where(eq(dbm.drizzleSchema.recall_cards.deck_id, deck.id));

  return new Map(rows.map((row) => [row.key, row.id]));
}

async function stateRow(userId: number, cardId: number) {
  const [row] = await dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.recall_card_states)
    .where(
      and(
        eq(dbm.drizzleSchema.recall_card_states.user_id, userId),
        eq(dbm.drizzleSchema.recall_card_states.card_id, cardId),
      ),
    )
    .limit(1);
  return row;
}

async function logRows(userId: number, cardId: number) {
  return dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.recall_review_logs)
    .where(
      and(
        eq(dbm.drizzleSchema.recall_review_logs.user_id, userId),
        eq(dbm.drizzleSchema.recall_review_logs.card_id, cardId),
      ),
    );
}

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

  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values([
      { id: USER_A, username: "recall-svc-a", password_hash: "x" },
      { id: USER_B, username: "recall-svc-b", password_hash: "x" },
    ])
    .onConflictDoNothing();

  const importModule = await import("../recall-import");
  importDeck = importModule.importDeck;

  const service = await import("../recall");
  submitReview = service.submitReview;
  getCard = service.getCard;
  getTodayQueue = service.getTodayQueue;
  archiveCard = service.archiveCard;
  unarchiveCard = service.unarchiveCard;
  RecallServiceError = service.RecallServiceError;
});

beforeEach(async () => {
  await resetRecallTables();
  await dbm.drizzleDb
    .delete(dbm.drizzleSchema.system_settings)
    .where(eq(dbm.drizzleSchema.system_settings.key, "recall_new_cards_per_day"));
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

/** 把 drizzle 包装过的错误（含 cause）摊平成可断言的文本 */
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  let causeText = "";
  if (cause instanceof Error) causeText = cause.message;
  else if (cause !== undefined) {
    causeText =
      typeof cause === "object" ? JSON.stringify(cause) : String(cause);
  }
  return `${error.message} ${causeText}`;
}

describe("getCard", () => {
  it("没有复习记录时 state 为 null，内容按 kind 解析", async () => {
    const ids = await seedDeck("card", [listCard("c01"), clozeCard("c02")]);

    const list = await getCard(USER_A, ids.get("c01")!);
    expect(list.kind).toBe("list");
    expect(list.items).toHaveLength(3);
    expect(list.blanks).toBeNull();
    expect(list.state).toBeNull();
    expect(list.deckKey).toBe("deck-card");

    const cloze = await getCard(USER_A, ids.get("c02")!);
    expect(cloze.kind).toBe("cloze");
    expect(cloze.blanks).toHaveLength(2);
    expect(cloze.items).toBeNull();
  });

  it("卡片不存在时报明确错误", async () => {
    await expect(getCard(USER_A, 999_999)).rejects.toBeInstanceOf(
      RecallServiceError,
    );
  });
});

describe("submitReview（列举卡）", () => {
  it("部分正确 → hard，pendingItems 记录错的条目，日志与状态同时落库", async () => {
    const ids = await seedDeck("list", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    const result = await submitReview(USER_A, cardId, {
      typed: "1. 建立安全制度 2. 开展安全演练 3. 想不起来了",
      now: NOW,
    });

    expect(result.mode).toBe("first");
    expect(result.verdicts).toEqual(["ok", "ok", "miss"]);
    expect(result.itemIndexes).toEqual([0, 1, 2]);
    expect(result.keywordHits).toBe(2);
    expect(result.keywordTotal).toBe(3);
    expect(result.rating).toBe("hard");
    expect(result.pendingItems).toEqual([2]);
    expect(result.duplicate).toBe(false);
    expect(new Date(result.nextDue).getTime()).toBeGreaterThan(NOW.getTime());

    const state = await stateRow(USER_A, cardId);
    expect(state).toBeTruthy();
    expect(state!.pending_items).toBe("[2]");
    expect(state!.due).toBe(result.nextDue);
    expect(state!.reps).toBe(1);
    expect(state!.state).not.toBe(0);

    const logs = await logRows(USER_A, cardId);
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.ts).toBe("2026-11-13T02:00:00.000Z");
    expect(log.mode).toBe("first");
    expect(JSON.parse(String(log.algo_verdicts))).toEqual(["ok", "ok", "miss"]);
    expect(log.user_overrides).toBeNull();
    expect(log.keyword_hits).toBe(2);
    expect(log.keyword_total).toBe(3);
    expect(log.derived_rating).toBe("hard");
    expect(log.typed_answer).toContain("想不起来了");
    expect(JSON.parse(String(log.fsrs_after)).due).toBe(result.nextDue);
    expect(JSON.parse(String(log.fsrs_before)).due).toBe(
      "2026-11-13T02:00:00.000Z",
    );
  });

  it("全对 → good，pendingItems 清空", async () => {
    const ids = await seedDeck("allok", [listCard("c01")]);
    const result = await submitReview(USER_A, ids.get("c01")!, {
      typed: "安全制度 安全演练 救助",
      now: NOW,
    });

    expect(result.rating).toBe("good");
    expect(result.pendingItems).toBeNull();
    expect((await stateRow(USER_A, ids.get("c01")!))!.pending_items).toBeNull();
  });

  it("「全没想起」→ again（即使文本里恰好命中了关键词）", async () => {
    const ids = await seedDeck("blank", [listCard("c01")]);
    const result = await submitReview(USER_A, ids.get("c01")!, {
      typed: "安全制度 安全演练 救助",
      allBlank: true,
      now: NOW,
    });

    expect(result.rating).toBe("again");
    expect(result.pendingItems).toEqual([0, 1, 2]);
    expect((await logRows(USER_A, ids.get("c01")!))[0].derived_rating).toBe(
      "again",
    );
  });

  it("改判：把漏判的条目标 ok 后 → good，日志保留算法原判与改判记录", async () => {
    const ids = await seedDeck("override", [listCard("c01")]);
    const result = await submitReview(USER_A, ids.get("c01")!, {
      typed: "安全制度 安全演练 我写了及时救助受伤学生",
      overrides: [{ index: 2, to: "ok" }],
      now: NOW,
    });

    // "我写了及时救助受伤学生" 其实能命中，这里主要验证改判路径的结果与留痕
    expect(result.verdicts).toEqual(["ok", "ok", "ok"]);
    expect(result.rating).toBe("good");
    expect(result.pendingItems).toBeNull();

    const log = (await logRows(USER_A, ids.get("c01")!))[0];
    expect(JSON.parse(String(log.user_overrides))).toEqual([
      { index: 2, to: "ok" },
    ]);
  });

  it("改判下标不在本次呈现范围内 → 报错且不写任何行", async () => {
    const ids = await seedDeck("override-bad", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await expect(
      submitReview(USER_A, cardId, {
        typed: "安全制度",
        overrides: [{ index: 9, to: "ok" }],
        now: NOW,
      }),
    ).rejects.toThrow(/不在本次呈现的条目里/);

    expect(await logRows(USER_A, cardId)).toHaveLength(0);
    expect(await stateRow(USER_A, cardId)).toBeUndefined();
  });
});

describe("submitReview（重测）", () => {
  it("重测只判 pendingItems 条目，全对 → 清空", async () => {
    const ids = await seedDeck("retest", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await submitReview(USER_A, cardId, {
      typed: "安全制度 安全演练",
      now: NOW,
    });

    const retest = await submitReview(USER_A, cardId, {
      typed: "及时救助了受伤学生",
      now: new Date(NOW.getTime() + 864e5),
    });

    expect(retest.mode).toBe("retest");
    expect(retest.itemIndexes).toEqual([2]);
    expect(retest.verdicts).toEqual(["ok"]);
    expect(retest.rating).toBe("good");
    expect(retest.pendingItems).toBeNull();

    const state = await stateRow(USER_A, cardId);
    expect(state!.pending_items).toBeNull();
    expect(state!.reps).toBe(2);
  });

  it("重测仍错 → pendingItems 取交集（只留仍错的）", async () => {
    const ids = await seedDeck("retest2", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await submitReview(USER_A, cardId, { typed: "安全制度", now: NOW });

    const retest = await submitReview(USER_A, cardId, {
      typed: "安全演练 写了点别的",
      now: new Date(NOW.getTime() + 864e5),
    });

    expect(retest.mode).toBe("retest");
    expect(retest.itemIndexes).toEqual([1, 2]);
    expect(retest.verdicts).toEqual(["ok", "miss"]);
    expect(retest.pendingItems).toEqual([2]);
    expect(retest.rating).toBe("hard");
  });

  it("显式传 mode=first 时判全卡（不受 pendingItems 限制）", async () => {
    const ids = await seedDeck("retest3", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await submitReview(USER_A, cardId, { typed: "安全制度", now: NOW });
    const again = await submitReview(USER_A, cardId, {
      typed: "安全制度 安全演练 救助",
      mode: "first",
      now: new Date(NOW.getTime() + 864e5),
    });

    expect(again.itemIndexes).toEqual([0, 1, 2]);
    expect(again.rating).toBe("good");
  });
});

describe("submitReview（填空卡）", () => {
  it("按空判分：全对 → good", async () => {
    const ids = await seedDeck("cloze", [clozeCard("c01")]);
    const result = await submitReview(USER_A, ids.get("c01")!, {
      typed: "危及人身安全、健康 教育教学设施",
      now: NOW,
    });

    expect(result.verdicts).toEqual(["ok", "ok"]);
    expect(result.rating).toBe("good");
    expect(result.pendingItems).toBeNull();
  });

  it("段数不足 → 缺的空判 miss，pendingItems 指向空位下标", async () => {
    const ids = await seedDeck("cloze2", [clozeCard("c01")]);
    const result = await submitReview(USER_A, ids.get("c01")!, {
      typed: "危及人身安全",
      now: NOW,
    });

    expect(result.verdicts).toEqual(["ok", "miss"]);
    expect(result.rating).toBe("hard");
    expect(result.pendingItems).toEqual([1]);
  });
});

describe("幂等：同一秒重复提交", () => {
  it("只写一条日志、状态不重复推进", async () => {
    const ids = await seedDeck("idem", [listCard("c01")]);
    const cardId = ids.get("c01")!;
    const typed = "安全制度 安全演练 救助";

    const first = await submitReview(USER_A, cardId, { typed, now: NOW });
    const stateAfterFirst = await stateRow(USER_A, cardId);

    // 同一秒内的重放（双击 / 网络重试）
    const replay = await submitReview(USER_A, cardId, {
      typed,
      now: new Date(NOW.getTime() + 400),
    });

    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(await logRows(USER_A, cardId)).toHaveLength(1);

    const stateAfterReplay = await stateRow(USER_A, cardId);
    expect(stateAfterReplay).toEqual(stateAfterFirst);
    expect(replay.nextDue).toBe(stateAfterFirst!.due);
  });

  it("跨秒（下一秒）提交是新的一次复习，正常写日志", async () => {
    const ids = await seedDeck("idem2", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await submitReview(USER_A, cardId, { typed: "安全制度", now: NOW });
    const second = await submitReview(USER_A, cardId, {
      typed: "安全制度",
      now: new Date(NOW.getTime() + 3000),
    });

    expect(second.duplicate).toBe(false);
    expect(await logRows(USER_A, cardId)).toHaveLength(2);
    expect((await stateRow(USER_A, cardId))!.reps).toBe(2);
  });
});

describe("事务原子性", () => {
  it("状态写入失败时日志不留下（触发器模拟）", async () => {
    const ids = await seedDeck("atomic", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    // 用 better-sqlite3 的 exec 建触发器：libsql 的单语句接口不保证能解析
    // BEGIN…END 内部的语句分隔符，exec 明确支持
    dbm.getLegacyDb().exec(
      `CREATE TRIGGER recall_states_fail BEFORE INSERT ON recall_card_states
       BEGIN SELECT RAISE(ABORT, 'simulated state write failure'); END`,
    );

    try {
      const error = await submitReview(USER_A, cardId, {
        typed: "安全制度 安全演练 救助",
        now: NOW,
      }).catch((e: unknown) => e);

      // drizzle 会把底层错误包成 "Failed query: …"，原始原因在 cause 里
      expect(errorText(error)).toMatch(/simulated state write failure/);

      // 日志与状态必须一起回滚
      expect(await logRows(USER_A, cardId)).toHaveLength(0);
      expect(await stateRow(USER_A, cardId)).toBeUndefined();
    } finally {
      dbm.getLegacyDb().exec("DROP TRIGGER IF EXISTS recall_states_fail");
    }

    // 去掉故障后同一份提交能正常落库（证明失败是事务回滚，不是卡死）
    const ok = await submitReview(USER_A, cardId, {
      typed: "安全制度 安全演练 救助",
      now: NOW,
    });
    expect(ok.duplicate).toBe(false);
    expect(await logRows(USER_A, cardId)).toHaveLength(1);
  });
});

describe("队列与设置", () => {
  it("新卡额度默认 6，设置 3 生效，设置 99 被夹到 15", async () => {
    await seedDeck(
      "quota",
      Array.from({ length: 20 }, (_, index) =>
        listCard(`c${String(index).padStart(2, "0")}`),
      ),
    );

    const byDefault = await getTodayQueue(USER_A, { now: NOW });
    expect(byDefault.fresh).toHaveLength(6);

    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.system_settings)
      .values({
        user_id: USER_A,
        key: "recall_new_cards_per_day",
        value: "3",
      })
      .onConflictDoUpdate({
        target: [
          dbm.drizzleSchema.system_settings.user_id,
          dbm.drizzleSchema.system_settings.key,
        ],
        set: { value: "3" },
      });
    expect((await getTodayQueue(USER_A, { now: NOW })).fresh).toHaveLength(3);

    await dbm.drizzleDb
      .update(dbm.drizzleSchema.system_settings)
      .set({ value: "99" })
      .where(
        and(
          eq(dbm.drizzleSchema.system_settings.user_id, USER_A),
          eq(dbm.drizzleSchema.system_settings.key, "recall_new_cards_per_day"),
        ),
      );
    expect((await getTodayQueue(USER_A, { now: NOW })).fresh).toHaveLength(15);
  });

  it("复习过的新卡离开新卡池，并作为到期卡在当天额度内滚动", async () => {
    const ids = await seedDeck("flow", [listCard("c01"), listCard("c02")]);
    const cardId = ids.get("c01")!;

    const before = await getTodayQueue(USER_A, { now: NOW });
    expect(before.fresh).toHaveLength(2);

    await submitReview(USER_A, cardId, { typed: "安全制度 安全演练 救助", now: NOW });

    const after = await getTodayQueue(USER_A, { now: NOW });
    // 复习过的卡离开新卡池；另一张没复习的仍是新卡
    expect(after.fresh).toEqual([ids.get("c02")!]);
    // 复习过的卡下一次 due 在几天后，今天不会再进队列
    expect(after.due).toEqual([]);
    expect(after.total).toBe(1);
  });
});

describe("归档", () => {
  it("归档未复习的新卡：移出新卡池；取消归档后回到新卡池", async () => {
    const ids = await seedDeck("archive", [listCard("c01"), listCard("c02")]);
    const cardId = ids.get("c01")!;

    await archiveCard(USER_A, cardId);
    expect((await stateRow(USER_A, cardId))!.archived).toBe(1);
    expect((await getTodayQueue(USER_A, { now: NOW })).fresh).toEqual([
      ids.get("c02")!,
    ]);

    expect(await unarchiveCard(USER_A, cardId)).toBe(true);
    const state = await stateRow(USER_A, cardId);
    // 没有任何复习记录的归档卡取消归档后必须回到新卡池（删掉空状态行）
    expect(state).toBeUndefined();
    const queue = await getTodayQueue(USER_A, { now: NOW });
    expect(queue.fresh).toContain(cardId);
  });

  it("归档有复习记录的卡：保留历史，取消归档后回到到期队列", async () => {
    const ids = await seedDeck("archive2", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await submitReview(USER_A, cardId, { typed: "安全制度 安全演练 救助", now: NOW });
    const reviewed = await stateRow(USER_A, cardId);

    await archiveCard(USER_A, cardId);
    const archived = await stateRow(USER_A, cardId);
    expect(archived!.archived).toBe(1);
    expect(archived!.reps).toBe(reviewed!.reps);

    expect(await unarchiveCard(USER_A, cardId)).toBe(true);
    const restored = await stateRow(USER_A, cardId);
    expect(restored!.archived).toBe(0);
    expect(restored!.due).toBe(reviewed!.due);
  });

  it("归档不存在的卡片 → 明确报错", async () => {
    await expect(archiveCard(USER_A, 999_999)).rejects.toBeInstanceOf(
      RecallServiceError,
    );
  });

  it("另一个用户的归档不影响本用户", async () => {
    const ids = await seedDeck("archive3", [listCard("c01")]);
    const cardId = ids.get("c01")!;

    await archiveCard(USER_A, cardId);
    const queueB = await getTodayQueue(USER_B, { now: NOW });
    expect(queueB.fresh).toContain(cardId);
  });
});
