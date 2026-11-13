// @vitest-environment node
/**
 * 回忆自测 P1：卡组导入 / 导出（真实 SQLite + 真实迁移，不 mock SQL）
 *
 * 覆盖规格 §1.1（幂等导入、导出同格式）与 §6 验收 5（重复导入卡片数与
 * 全部 CardState 不变），以及"内容冲突默认保留我的"这条产品决定。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type {
  RecallCard,
  RecallClozeCard,
  RecallListCard,
} from "../../recall/types";

const dbFile = `test-recall-import-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type RecallImportModule = typeof import("../recall-import");
type RecallSchema = typeof import("../../recall/schema");

let dbm: DbModule;
let importDeck: RecallImportModule["importDeck"];
let exportDeck: RecallImportModule["exportDeck"];
let listDecks: RecallImportModule["listDecks"];
let parseRecallDeck: RecallSchema["parseRecallDeck"];
let RecallDeckValidationError: RecallSchema["RecallDeckValidationError"];
let getStudyDay: typeof import("../../recall/study-day").getStudyDay;
let getStudyDayStart: typeof import("../../recall/study-day").getStudyDayStart;

const USER_A = 1;
const USER_B = 2;

/** 列举卡工厂 */
function listCard(
  cardId: string,
  overrides: Partial<RecallListCard> = {},
): RecallListCard {
  return {
    cardId,
    kind: "list",
    groupId: "G1",
    prompt: `题干 ${cardId}`,
    items: [
      { text: "建立安全制度和应急机制", keywords: ["安全制度", "应急机制"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
    ],
    verbatim: false,
    ...overrides,
  };
}

/** 填空卡工厂 */
function clozeCard(
  cardId: string,
  overrides: Partial<RecallClozeCard> = {},
): RecallClozeCard {
  return {
    cardId,
    kind: "cloze",
    groupId: "G1",
    prompt: "学校不得使未成年学生在【　】的校舍中活动。",
    blanks: [{ answers: ["危及人身安全、健康", "危及人身安全", "危及安全"] }],
    ...overrides,
  };
}

/** 卡组文件工厂 */
function deckFile(
  deckId: string,
  cards: RecallCard[],
): Record<string, unknown> {
  return {
    schema: 1,
    deckId,
    title: `测试卡组 ${deckId}`,
    groups: [{ groupId: "G1", title: "第一组", order: 1 }],
    cards,
  };
}

async function deckIdOf(deckKey: string): Promise<number> {
  const [row] = await dbm.drizzleDb
    .select({ id: dbm.drizzleSchema.recall_decks.id })
    .from(dbm.drizzleSchema.recall_decks)
    .where(eq(dbm.drizzleSchema.recall_decks.deck_key, deckKey))
    .limit(1);
  expect(row, `卡组 ${deckKey} 应存在`).toBeTruthy();
  return row.id;
}

async function cardOf(deckKey: string, cardId: string) {
  const deckId = await deckIdOf(deckKey);
  const [row] = await dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.recall_cards)
    .where(
      and(
        eq(dbm.drizzleSchema.recall_cards.deck_id, deckId),
        eq(dbm.drizzleSchema.recall_cards.card_key, cardId),
      ),
    )
    .limit(1);
  expect(row, `卡片 ${cardId} 应存在`).toBeTruthy();
  return row;
}

async function stateOf(userId: number, cardId: number) {
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

async function tableCounts(): Promise<{ decks: number; cards: number }> {
  const { recall_decks, recall_cards } = dbm.drizzleSchema;
  const deckRows = await dbm.drizzleDb
    .select({ id: recall_decks.id })
    .from(recall_decks);
  const cardRows = await dbm.drizzleDb
    .select({ id: recall_cards.id })
    .from(recall_cards);
  return { decks: deckRows.length, cards: cardRows.length };
}

describe("回忆自测卡组导入 / 导出（真实 SQLite）", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();

    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.users)
      .values([
        { id: USER_A, username: "recall-user-a", password_hash: "x" },
        { id: USER_B, username: "recall-user-b", password_hash: "x" },
      ])
      .onConflictDoNothing();

    const svc = await import("../recall-import");
    importDeck = svc.importDeck;
    exportDeck = svc.exportDeck;
    listDecks = svc.listDecks;

    const recallSchema = await import("../../recall/schema");
    parseRecallDeck = recallSchema.parseRecallDeck;
    RecallDeckValidationError = recallSchema.RecallDeckValidationError;

    const studyDay = await import("../../recall/study-day");
    getStudyDay = studyDay.getStudyDay;
    getStudyDayStart = studyDay.getStudyDayStart;
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("首次导入：卡组 1 条、卡片 N 条、分组随卡组保存", async () => {
    const result = await importDeck(
      USER_A,
      deckFile("deck-first", [listCard("G1-c01"), clozeCard("G1-c02")]),
    );

    expect(result.createdCards).toBe(2);
    expect(result.updatedCards).toBe(0);
    expect(result.skippedCards).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(result.missingInFile).toEqual([]);

    const deckId = await deckIdOf("deck-first");
    expect(result.deckId).toBe(deckId);

    const deck = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.recall_decks)
      .where(eq(dbm.drizzleSchema.recall_decks.id, deckId));
    expect(deck[0].schema_version).toBe(1);
    // 导入的卡组是公共卡组：谁先导入都不该获得"所有权"
    expect(deck[0].owner_user_id).toBeNull();
    expect(JSON.parse(String(deck[0].groups_json))).toEqual([
      { groupId: "G1", title: "第一组", order: 1 },
    ]);

    const listRow = await cardOf("deck-first", "G1-c01");
    expect(listRow.kind).toBe("list");
    expect(listRow.verbatim).toBe(0);
    expect(listRow.blanks_json).toBeNull();
    expect(JSON.parse(String(listRow.items_json))).toHaveLength(2);

    const clozeRow = await cardOf("deck-first", "G1-c02");
    expect(clozeRow.kind).toBe("cloze");
    expect(clozeRow.items_json).toBeNull();
    expect(JSON.parse(String(clozeRow.blanks_json))[0].answers).toHaveLength(3);
    // 两张卡的指纹必须不同（否则冲突判定形同虚设）
    expect(listRow.prompt_hash).not.toBe(clozeRow.prompt_hash);
  });

  it("重复导入同一文件：createdCards=0、skippedCards=N、CardState 逐列不变", async () => {
    await importDeck(USER_A, deckFile("deck-idem", [listCard("A-1")]));
    const card = await cardOf("deck-idem", "A-1");

    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: USER_A,
      card_id: card.id,
      due: "2026-12-01T00:00:00.000Z",
      stability: 4.25,
      difficulty: 5.5,
      state: 2,
      reps: 3,
      lapses: 1,
      last_review: "2026-11-20T00:00:00.000Z",
      pending_items: "[1]",
      archived: 0,
    });
    const before = await stateOf(USER_A, card.id);

    const second = await importDeck(
      USER_A,
      deckFile("deck-idem", [listCard("A-1")]),
    );
    expect(second.createdCards).toBe(0);
    expect(second.updatedCards).toBe(0);
    expect(second.skippedCards).toBe(1);
    expect(second.conflicts).toEqual([]);

    const after = await stateOf(USER_A, card.id);
    expect(after).toEqual(before);
    // 卡行也不能被改（重复导入对库零副作用，连 updated_at 都不动）
    const cardAfter = await cardOf("deck-idem", "A-1");
    expect(cardAfter.prompt_hash).toBe(card.prompt_hash);
    expect(cardAfter.updated_at).toBe(card.updated_at);
  });

  it("同 cardId 内容变更：默认 keep 保留库内内容并报冲突", async () => {
    await importDeck(
      USER_A,
      deckFile("deck-keep", [listCard("K-1", { prompt: "旧题干" })]),
    );
    const before = await cardOf("deck-keep", "K-1");

    const result = await importDeck(
      USER_A,
      deckFile("deck-keep", [listCard("K-1", { prompt: "新题干" })]),
    );

    expect(result.conflicts).toEqual([{ cardId: "K-1", action: "keep" }]);
    expect(result.updatedCards).toBe(0);
    expect(result.skippedCards).toBe(0);

    const after = await cardOf("deck-keep", "K-1");
    expect(after.prompt).toBe("旧题干");
    // keep 有意不更新 prompt_hash：冲突必须每次导入都继续报出来
    expect(after.prompt_hash).toBe(before.prompt_hash);

    // 再导一次仍然报冲突（不会被"静默 skip"掉）
    const again = await importDeck(
      USER_A,
      deckFile("deck-keep", [listCard("K-1", { prompt: "新题干" })]),
    );
    expect(again.conflicts).toEqual([{ cardId: "K-1", action: "keep" }]);
    expect(again.skippedCards).toBe(0);
  });

  it("同 cardId 内容变更：accept 覆盖内容但保留复习进度", async () => {
    await importDeck(
      USER_A,
      deckFile("deck-accept", [listCard("AC-1", { prompt: "旧题干" })]),
    );
    const card = await cardOf("deck-accept", "AC-1");
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: USER_A,
      card_id: card.id,
      due: "2026-12-05T00:00:00.000Z",
      stability: 9.75,
      difficulty: 4.5,
      state: 2,
      reps: 5,
      lapses: 2,
      archived: 0,
    });
    const stateBefore = await stateOf(USER_A, card.id);

    const result = await importDeck(
      USER_A,
      deckFile("deck-accept", [
        listCard("AC-1", {
          prompt: "新题干",
          items: [{ text: "只有一条", keywords: ["只有一条"] }],
        }),
      ]),
      { onConflict: "accept" },
    );

    expect(result.conflicts).toEqual([{ cardId: "AC-1", action: "accept" }]);
    expect(result.updatedCards).toBe(1);

    const after = await cardOf("deck-accept", "AC-1");
    expect(after.prompt).toBe("新题干");
    expect(after.prompt_hash).not.toBe(card.prompt_hash);
    expect(JSON.parse(String(after.items_json))).toHaveLength(1);

    // 进度一条都不能丢：due / stability / reps 全部原样
    const stateAfter = await stateOf(USER_A, card.id);
    expect(stateAfter).toEqual(stateBefore);
  });

  it("文件里缺少某卡：missingInFile 报告且库里不删除", async () => {
    await importDeck(
      USER_A,
      deckFile("deck-missing", [listCard("M-1"), listCard("M-2")]),
    );
    const result = await importDeck(
      USER_A,
      deckFile("deck-missing", [listCard("M-2")]),
    );

    expect(result.missingInFile).toEqual(["M-1"]);
    expect(result.skippedCards).toBe(1);
    // M-1 仍在库里
    const still = await cardOf("deck-missing", "M-1");
    expect(still.card_key).toBe("M-1");
  });

  it("未知 schema 版本：拒绝导入且库里零写入", async () => {
    const before = await tableCounts();
    const bad = { ...deckFile("deck-version", [listCard("V-1")]), schema: 2 };

    await expect(importDeck(USER_A, bad)).rejects.toThrow(/schema=2/);
    await expect(importDeck(USER_A, bad)).rejects.toBeInstanceOf(
      RecallDeckValidationError,
    );

    expect(await tableCounts()).toEqual(before);
    const decks = await dbm.drizzleDb
      .select({ id: dbm.drizzleSchema.recall_decks.id })
      .from(dbm.drizzleSchema.recall_decks)
      .where(eq(dbm.drizzleSchema.recall_decks.deck_key, "deck-version"));
    expect(decks).toHaveLength(0);
  });

  it("校验错误能定位到 cards[i].cardId 与字段路径", async () => {
    const bad = deckFile("deck-invalid", [
      listCard("OK-1"),
      clozeCard("BAD-2", {
        blanks: [{ answers: ["a", "b", "c", "d"] }, { answers: [] }],
      }),
    ]);

    let error: unknown;
    try {
      await importDeck(USER_A, bad);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecallDeckValidationError);
    const issues = (error as InstanceType<typeof RecallDeckValidationError>)
      .issues;
    // 一次报全（两个空各自的错误都要在）
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join("\n")).toContain("cards[1] (cardId=BAD-2)");
    expect(issues.join("\n")).toContain("blanks[0].answers");
    expect(issues.join("\n")).toContain("blanks[1].answers");

    // 校验失败同样保证零写入
    const decks = await dbm.drizzleDb
      .select({ id: dbm.drizzleSchema.recall_decks.id })
      .from(dbm.drizzleSchema.recall_decks)
      .where(eq(dbm.drizzleSchema.recall_decks.deck_key, "deck-invalid"));
    expect(decks).toHaveLength(0);
  });

  it("导出与导入同格式：能通过 zod 再导入，且不含任何用户数据", async () => {
    await importDeck(
      USER_A,
      deckFile("deck-roundtrip", [listCard("R-1"), clozeCard("R-2")]),
    );
    const card = await cardOf("deck-roundtrip", "R-1");
    // 用户作答数据只存在于 state / log 两张用户表里，导出必须完全看不见
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: USER_A,
      card_id: card.id,
      due: "2026-12-09T00:00:00.000Z",
      state: 2,
    });
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_review_logs).values({
      user_id: USER_A,
      card_id: card.id,
      ts: "2026-12-01T00:00:00.000Z",
      mode: "first",
      typed_answer: "用户的作答原文",
      derived_rating: "good",
    });

    const exported = await exportDeck("deck-roundtrip");
    expect(JSON.stringify(exported)).not.toContain("typedAnswer");
    expect(JSON.stringify(exported)).not.toContain("stability");
    expect(JSON.stringify(exported)).not.toContain("due");
    expect(JSON.stringify(exported)).not.toContain("用户的作答原文");

    // 与导入同一格式 → zod 直接过
    expect(() => parseRecallDeck(exported)).not.toThrow();
    // 且原样再导入时全部命中"内容一致"，不新增不复位
    const again = await importDeck(USER_A, exported);
    expect(again.createdCards).toBe(0);
    expect(again.skippedCards).toBe(2);
    expect(again.conflicts).toEqual([]);
    expect(again.missingInFile).toEqual([]);
  });

  it("listDecks：卡片数与该用户的归档/未复习统计按用户隔离", async () => {
    await importDeck(
      USER_A,
      deckFile("deck-list", [
        listCard("L-1"),
        listCard("L-2"),
        listCard("L-3"),
      ]),
    );
    const card1 = await cardOf("deck-list", "L-1");
    const card2 = await cardOf("deck-list", "L-2");

    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values([
      {
        user_id: USER_A,
        card_id: card1.id,
        due: "2020-01-01T00:00:00.000Z",
        archived: 0,
      },
      {
        user_id: USER_A,
        card_id: card2.id,
        due: "2020-01-02T00:00:00.000Z",
        archived: 1,
      },
      // 另一个用户的进度不得混进 A 的统计
      {
        user_id: USER_B,
        card_id: card1.id,
        due: "2020-01-03T00:00:00.000Z",
        archived: 0,
      },
    ]);

    const summaries = await listDecks(USER_A);
    const row = summaries.find((item) => item.deckKey === "deck-list");
    expect(row).toBeTruthy();
    expect(row!.cardCount).toBe(3);
    expect(row!.activeCount).toBe(1);
    expect(row!.archivedCount).toBe(1);
    expect(row!.untouchedCount).toBe(1);
    expect(row!.dueCount).toBe(1);

    const summariesB = await listDecks(USER_B);
    const rowB = summariesB.find((item) => item.deckKey === "deck-list");
    expect(rowB!.activeCount).toBe(1);
    expect(rowB!.dueCount).toBe(1);
  });
});

describe("学习日边界（Asia/Shanghai 04:00）", () => {
  // 这两个函数是纯函数，单独跑本 describe（`-t 学习日边界`）时也要能拿到：
  // 不能依赖上面那个 describe 的 beforeAll。
  beforeAll(async () => {
    if (!getStudyDay || !getStudyDayStart) {
      const studyDay = await import("../../recall/study-day");
      getStudyDay = studyDay.getStudyDay;
      getStudyDayStart = studyDay.getStudyDayStart;
    }
  });

  it("UTC 19:59 与 20:00 分属不同学习日", () => {
    // 北京 03:59 → 仍属前一天；北京 04:00 → 新的一天
    expect(getStudyDay(new Date("2026-11-13T19:59:00.000Z"))).toBe(
      "2026-11-13",
    );
    expect(getStudyDay(new Date("2026-11-13T20:00:00.000Z"))).toBe(
      "2026-11-14",
    );
  });

  it("学习日内部的时刻归属相同，且起始时刻是当地 04:00", () => {
    expect(getStudyDay(new Date("2026-11-13T20:00:00.000Z"))).toBe(
      getStudyDay(new Date("2026-11-14T19:59:59.000Z")),
    );
    expect(getStudyDayStart("2026-11-14").toISOString()).toBe(
      "2026-11-13T20:00:00.000Z",
    );
    expect(() => getStudyDayStart("2026-13-40")).toThrow(/非法学习日/);
  });
});
