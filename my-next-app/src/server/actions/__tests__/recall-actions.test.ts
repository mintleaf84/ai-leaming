// @vitest-environment node
/**
 * 回忆自测 P3 Server Actions（真实 SQLite + 真实迁移，只 mock 鉴权）。
 *
 * 覆盖任务书要求的接线行为：
 * 1. 队列概要的 `total/due/fresh` 与「新卡上限」一致；
 * 2. 取卡时 `mode="retest"` 与 `pendingItems` 对得上；
 * 3. 提交判分正常路径、`overrides` 生效、`nextReviewText` 两种文案；
 * 4. `streakDays` 的连续 / 断档 / 今天还没学三种边界；
 * 5. 单卡新增·修改·删除（删除后队列与取卡都不再包含它）；
 * 6. 未登录时 action 报错而不是静默返回空数据。
 *
 * 鉴权只 mock `requireUser` 的返回值：DB 必须是真库，否则"删卡后队列不含它"
 * 这类断言会被内存 mock 的语义差异糊过去。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getStudyDay, getStudyDayStart } from "@/lib/recall/study-day";
import type {
  RecallCard,
  RecallClozeCard,
  RecallGroup,
  RecallListCard,
} from "@/lib/recall/types";

const dbFile = `test-recall-actions-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

const authState = vi.hoisted(() => ({
  user: null as { id: number; role?: string } | null,
}));

vi.mock("@/lib/auth/auth", () => ({
  requireUser: async () => {
    if (!authState.user) throw new Error("未登录");
    return authState.user;
  },
  requireRole: async () => {
    if (!authState.user) throw new Error("未登录");
    return authState.user;
  },
}));

type DbModule = typeof import("@/lib/db");
type ImportModule = typeof import("@/lib/services/recall-import");
type ServiceModule = typeof import("@/lib/services/recall");
type ActionsModule = typeof import("../recall");

let dbm: DbModule;
let importDeck: ImportModule["importDeck"];
let upsertCard: ImportModule["upsertCard"];
let recallService: ServiceModule;
let actions: ActionsModule;

const USER_A = 710;

function listCard(
  cardId: string,
  overrides: Partial<RecallListCard> = {},
): RecallListCard {
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
  groups: RecallGroup[] = [],
): Promise<Map<string, number>> {
  await importDeck(USER_A, {
    schema: 1,
    deckId: `deck-${tag}`,
    title: `接线测试 ${tag}`,
    groups,
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

async function resetRecallTables(): Promise<void> {
  const {
    recall_review_logs,
    recall_card_states,
    recall_cards,
    recall_decks,
    system_settings,
  } = dbm.drizzleSchema;
  await dbm.drizzleDb.delete(recall_review_logs);
  await dbm.drizzleDb.delete(recall_card_states);
  await dbm.drizzleDb.delete(recall_cards);
  await dbm.drizzleDb.delete(recall_decks);
  await dbm.drizzleDb
    .delete(system_settings)
    .where(eq(system_settings.key, "recall_new_cards_per_day"));
}

async function setNewLimit(value: string): Promise<void> {
  await dbm.drizzleDb.insert(dbm.drizzleSchema.system_settings).values({
    user_id: USER_A,
    key: "recall_new_cards_per_day",
    value,
  });
}

/** 直接造一条日志：连续天数只关心学习日归属，不关心判分内容 */
async function insertLog(cardId: number, at: Date): Promise<void> {
  await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_review_logs).values({
    user_id: USER_A,
    card_id: cardId,
    ts: at.toISOString(),
    mode: "first",
  });
}

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + delta * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 某个学习日内的一个稳定时刻（该日 05:00 北京时间 = 起点的 +1h） */
function atStudyDay(day: string, hourOffset = 1): Date {
  return new Date(getStudyDayStart(day).getTime() + hourOffset * 3_600_000);
}

beforeAll(async () => {
  dbm = await import("@/lib/db");
  await dbm.initDatabase();

  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values({ id: USER_A, username: "recall-actions-a", password_hash: "x" })
    .onConflictDoNothing();

  const importModule = await import("@/lib/services/recall-import");
  importDeck = importModule.importDeck;
  upsertCard = importModule.upsertCard;
  recallService = await import("@/lib/services/recall");
  actions = await import("../recall");
});

beforeEach(async () => {
  authState.user = { id: USER_A, role: "user" };
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

describe("getRecallQueueAction", () => {
  it("默认新卡上限 6，total = due + fresh", async () => {
    await seedDeck(
      "queue-default",
      Array.from({ length: 10 }, (_, index) => listCard(`q${index}`)),
    );

    const result = await actions.getRecallQueueAction();
    const data = result?.data;

    expect(data).toBeDefined();
    expect(data!.fresh).toBe(6);
    expect(data!.due).toBe(0);
    expect(data!.total).toBe(6);
    // 编号顺序 = due 优先再新卡；客户端逐张取卡只认 ids
    expect(data!.ids).toHaveLength(6);
    expect(data!.estimatedMinutes).toBe(Math.ceil(6 * 0.4));
    expect(data!.streakDays).toBe(0);
  });

  it("用户把新卡上限调到 2 后 fresh 只有 2", async () => {
    await seedDeck(
      "queue-limit",
      Array.from({ length: 5 }, (_, index) => listCard(`l${index}`)),
    );
    await setNewLimit("2");

    const data = (await actions.getRecallQueueAction())?.data;

    expect(data!.fresh).toBe(2);
    expect(data!.total).toBe(2);
  });

  it("到期卡计入 due 而不是 fresh", async () => {
    const ids = await seedDeck("queue-due", [listCard("d1"), listCard("d2")]);

    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: USER_A,
      card_id: ids.get("d1")!,
      due: new Date(Date.now() - 60_000).toISOString(),
      stability: 1,
      difficulty: 5,
      state: 2,
      reps: 1,
    });

    const data = (await actions.getRecallQueueAction())?.data;

    expect(data!.due).toBe(1);
    expect(data!.fresh).toBe(1);
    expect(data!.total).toBe(2);
  });
});

describe("getRecallCardAction", () => {
  it("上次有错条目时 mode=retest 且 pendingItems 正确", async () => {
    const ids = await seedDeck("card-retest", [listCard("c1")]);
    const cardId = ids.get("c1")!;

    // 只写出第 1 条 → 第 2、3 条判 miss
    await actions.submitRecallReviewAction({
      cardId,
      typed: "建立安全制度",
    });

    const data = (await actions.getRecallCardAction({ cardId }))?.data;

    expect(data!.mode).toBe("retest");
    expect(data!.pendingItems).toEqual([1, 2]);
    expect(data!.kind).toBe("list");
    expect(data!.items).toHaveLength(3);
    expect(data!.blanks).toBeNull();
    expect(data!.deckTitle).toBe("接线测试 card-retest");
  });

  it("新卡 mode=first、pendingItems 为 null", async () => {
    const ids = await seedDeck("card-first", [clozeCard("k1")]);

    const data = (
      await actions.getRecallCardAction({
        cardId: ids.get("k1")!,
      })
    )?.data;

    expect(data!.mode).toBe("first");
    expect(data!.pendingItems).toBeNull();
    expect(data!.kind).toBe("cloze");
    expect(data!.items).toBeNull();
    expect(data!.blanks).toHaveLength(2);
  });
});

describe("submitRecallReviewAction", () => {
  it("全对 → good，pendingItems 清空，文案是「下次 X 月 X 日」", async () => {
    const ids = await seedDeck("submit-ok", [listCard("s1")]);

    const data = (
      await actions.submitRecallReviewAction({
        cardId: ids.get("s1")!,
        typed: "1. 建立安全制度和应急机制 2. 开展安全演练 3. 及时救助受伤学生",
      })
    )?.data;

    expect(data!.verdicts).toEqual(["ok", "ok", "ok"]);
    expect(data!.rating).toBe("good");
    expect(data!.pendingItems).toBeNull();
    expect(data!.nextReviewText).toMatch(/^下次 \d{1,2} 月 \d{1,2} 日$/);
  });

  it("部分错误 → 文案是「明天只重测这 N 条」，N 等于新的 pendingItems", async () => {
    const ids = await seedDeck("submit-miss", [listCard("m1")]);

    const data = (
      await actions.submitRecallReviewAction({
        cardId: ids.get("m1")!,
        typed: "建立安全制度",
      })
    )?.data;

    expect(data!.verdicts).toEqual(["ok", "miss", "miss"]);
    expect(data!.rating).toBe("hard");
    expect(data!.pendingItems).toEqual([1, 2]);
    expect(data!.nextReviewText).toBe("明天只重测这 2 条");
  });

  it("overrides 把误判改成 ok → 评分随之变成 good", async () => {
    const ids = await seedDeck("submit-override", [listCard("o1")]);

    const data = (
      await actions.submitRecallReviewAction({
        cardId: ids.get("o1")!,
        typed: "建立安全制度",
        overrides: [
          { index: 1, to: "ok" },
          { index: 2, to: "ok" },
        ],
      })
    )?.data;

    expect(data!.verdicts).toEqual(["ok", "ok", "ok"]);
    expect(data!.rating).toBe("good");
    expect(data!.pendingItems).toBeNull();
    expect(data!.nextReviewText).toMatch(/^下次 /);
  });

  it("点「全没想起」→ again，全部条目进入重测", async () => {
    const ids = await seedDeck("submit-allblank", [listCard("b1")]);

    const data = (
      await actions.submitRecallReviewAction({
        cardId: ids.get("b1")!,
        typed: "建立安全制度",
        allBlank: true,
      })
    )?.data;

    expect(data!.rating).toBe("again");
    expect(data!.pendingItems).toEqual([0, 1, 2]);
    expect(data!.nextReviewText).toBe("明天只重测这 3 条");
  });
});

describe("streakDays", () => {
  it("连续 3 天（含今天）→ 3", async () => {
    const ids = await seedDeck("streak-3", [listCard("st1")]);
    const cardId = ids.get("st1")!;
    const today = getStudyDay(new Date());

    for (const delta of [0, -1, -2]) {
      await insertLog(cardId, atStudyDay(shiftDay(today, delta)));
    }

    const data = (await actions.getRecallQueueAction())?.data;
    expect(data!.streakDays).toBe(3);
  });

  it("今天还没学但昨天、前天学过 → 从昨天算起，仍是 2", async () => {
    const ids = await seedDeck("streak-yesterday", [listCard("sy1")]);
    const cardId = ids.get("sy1")!;
    const today = getStudyDay(new Date());

    for (const delta of [-1, -2]) {
      await insertLog(cardId, atStudyDay(shiftDay(today, delta)));
    }

    const data = (await actions.getRecallQueueAction())?.data;
    expect(data!.streakDays).toBe(2);
  });

  it("中间断一天 → 只算到断点为止", async () => {
    const ids = await seedDeck("streak-gap", [listCard("sg1")]);
    const cardId = ids.get("sg1")!;
    const today = getStudyDay(new Date());

    // 今天、前天、大前天：昨天缺失 → 连续天数应为 1
    for (const delta of [0, -2, -3]) {
      await insertLog(cardId, atStudyDay(shiftDay(today, delta)));
    }

    const data = (await actions.getRecallQueueAction())?.data;
    expect(data!.streakDays).toBe(1);
  });

  it("没有任何日志 → 0", async () => {
    await seedDeck("streak-none", [listCard("sn1")]);

    const data = (await actions.getRecallQueueAction())?.data;
    expect(data!.streakDays).toBe(0);
  });
});

describe("saveRecallCardAction / deleteRecallCardAction", () => {
  it("新增卡片后进入新卡队列，内容可读回", async () => {
    await seedDeck("save-new", [listCard("base")]);

    const saved = await actions.saveRecallCardAction({
      deckKey: "deck-save-new",
      cardId: "new-1",
      prompt: "新增的题干",
      kind: "list",
      items: [{ text: "条目一", keywords: ["条目一"] }],
    });
    expect(saved?.data).toEqual({ ok: true });

    const queue = (await actions.getRecallQueueAction())?.data;
    expect(queue!.fresh).toBe(2);

    const [card] = await dbm.drizzleDb
      .select({
        id: dbm.drizzleSchema.recall_cards.id,
        prompt: dbm.drizzleSchema.recall_cards.prompt,
      })
      .from(dbm.drizzleSchema.recall_cards)
      .where(eq(dbm.drizzleSchema.recall_cards.card_key, "new-1"))
      .limit(1);

    const view = (await actions.getRecallCardAction({ cardId: card.id }))?.data;
    expect(view!.prompt).toBe("新增的题干");
    // action 现在会带上 keywords（供客户端预判与服务端判分对齐）
    expect(view!.items).toEqual([{ text: "条目一", keywords: ["条目一"] }]);
  });

  it("同一 cardId 再保存是修改，不新增卡片", async () => {
    const ids = await seedDeck("save-edit", [listCard("e1")]);
    const cardId = ids.get("e1")!;

    const saved = await actions.saveRecallCardAction({
      deckKey: "deck-save-edit",
      cardId: "e1",
      prompt: "改过的题干",
      kind: "cloze",
      blanks: [{ answers: ["答案一"] }],
    });
    expect(saved?.data).toEqual({ ok: true });

    const view = (await actions.getRecallCardAction({ cardId }))?.data;
    expect(view!.prompt).toBe("改过的题干");
    expect(view!.kind).toBe("cloze");
    expect(view!.blanks).toEqual([{ answers: ["答案一"] }]);

    const decks = (await actions.listRecallDecksAction())?.data;
    const deck = decks!.find((item) => item.deckKey === "deck-save-edit");
    expect(deck!.cardCount).toBe(1);
  });

  it("删除后取卡报错、队列不再包含它", async () => {
    const ids = await seedDeck("delete", [listCard("x1"), listCard("x2")]);
    const cardId = ids.get("x1")!;

    const deleted = await actions.deleteRecallCardAction({
      deckKey: "deck-delete",
      cardId: "x1",
    });
    expect(deleted?.data).toEqual({ ok: true });

    const view = await actions.getRecallCardAction({ cardId });
    expect(view?.serverError).toContain("卡片不存在");

    const queue = (await actions.getRecallQueueAction())?.data;
    expect(queue!.fresh).toBe(1);

    const decks = (await actions.listRecallDecksAction())?.data;
    expect(
      decks!.find((deck) => deck.deckKey === "deck-delete")!.cardCount,
    ).toBe(1);
  });

  it("cardId 属于别的卡组时拒绝删除", async () => {
    await seedDeck("delete-other", [listCard("z1")]);
    await seedDeck("delete-owner", [listCard("z2")]);

    const result = await actions.deleteRecallCardAction({
      deckKey: "deck-delete-other",
      cardId: "z2",
    });

    expect(result?.serverError).toContain("不在卡组");
  });
});

describe("upsertCard 保留库内既有属性", () => {
  const items = [
    { text: "建立安全制度", keywords: ["安全制度"] },
    { text: "开展安全演练", keywords: ["安全演练"] },
  ];

  it("不传 groupId / verbatim 时沿用旧值，prompt_hash 因此不变", async () => {
    const ids = await seedDeck(
      "upsert-retain",
      [listCard("g1", { groupId: "group-a", verbatim: true, items })],
      [{ groupId: "group-a", title: "分组 A" }],
    );
    const cardId = ids.get("g1")!;

    const readCard = async () => {
      const [row] = await dbm.drizzleDb
        .select({
          group_key: dbm.drizzleSchema.recall_cards.group_key,
          verbatim: dbm.drizzleSchema.recall_cards.verbatim,
          prompt_hash: dbm.drizzleSchema.recall_cards.prompt_hash,
        })
        .from(dbm.drizzleSchema.recall_cards)
        .where(eq(dbm.drizzleSchema.recall_cards.id, cardId))
        .limit(1);
      return row;
    };

    const before = await readCard();

    // 模拟编辑器"只改了题干、没碰分组与 verbatim"的保存
    await upsertCard(USER_A, {
      deckKey: "deck-upsert-retain",
      cardId: "g1",
      prompt: "题干 g1",
      kind: "list",
      items,
    });

    const after = await readCard();
    expect(after.group_key).toBe("group-a");
    expect(after.verbatim).toBe(1);
    // hash 参与计算的有 groupId 与 verbatim：漏了它们这里就会变
    expect(after.prompt_hash).toBe(before.prompt_hash);
  });

  it("显式传 verbatim=false 才会关掉逐字判分", async () => {
    const ids = await seedDeck("upsert-verbatim-off", [
      listCard("v1", { verbatim: true, items }),
    ]);

    await upsertCard(USER_A, {
      deckKey: "deck-upsert-verbatim-off",
      cardId: "v1",
      prompt: "题干 v1",
      kind: "list",
      items,
      verbatim: false,
    });

    const [row] = await dbm.drizzleDb
      .select({ verbatim: dbm.drizzleSchema.recall_cards.verbatim })
      .from(dbm.drizzleSchema.recall_cards)
      .where(eq(dbm.drizzleSchema.recall_cards.id, ids.get("v1")!))
      .limit(1);
    expect(row.verbatim).toBe(0);
  });
});

describe("submitReview 过滤越界 pendingItems", () => {
  async function setPending(
    cardId: number,
    pendingItems: string,
  ): Promise<void> {
    await dbm.drizzleDb.insert(dbm.drizzleSchema.recall_card_states).values({
      user_id: USER_A,
      card_id: cardId,
      due: new Date(Date.now() - 60_000).toISOString(),
      stability: 5,
      difficulty: 5,
      state: 2,
      reps: 1,
      lapses: 0,
      last_review: new Date(Date.now() - 86_400_000).toISOString(),
      pending_items: pendingItems,
    });
  }

  it("部分下标越界时只呈现合法的那些", async () => {
    const ids = await seedDeck("pending-partial", [listCard("p1")]);
    const cardId = ids.get("p1")!;
    // 卡片只有 3 条，9 是编辑卡片后遗留的脏下标
    await setPending(cardId, "[0,9]");

    const result = await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
    });

    expect(result.mode).toBe("retest");
    expect(result.itemIndexes).toEqual([0]);
    expect(result.verdicts).toEqual(["ok"]);
  });

  it("全部越界时按首发处理（不把用户锁死在重测里）", async () => {
    const ids = await seedDeck("pending-all-invalid", [listCard("p2")]);
    const cardId = ids.get("p2")!;
    await setPending(cardId, "[7,9]");

    const result = await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
    });

    expect(result.mode).toBe("first");
    expect(result.itemIndexes).toEqual([0, 1, 2]);
    expect(result.verdicts).toEqual(["ok", "miss", "miss"]);
  });
});

describe("提交幂等键 clientKey", () => {
  async function readLogs(cardId: number) {
    return dbm.drizzleDb
      .select({
        id: dbm.drizzleSchema.recall_review_logs.id,
        client_key: dbm.drizzleSchema.recall_review_logs.client_key,
        ts: dbm.drizzleSchema.recall_review_logs.ts,
      })
      .from(dbm.drizzleSchema.recall_review_logs)
      .where(eq(dbm.drizzleSchema.recall_review_logs.card_id, cardId));
  }

  async function readState(cardId: number) {
    const [row] = await dbm.drizzleDb
      .select({
        reps: dbm.drizzleSchema.recall_card_states.reps,
        due: dbm.drizzleSchema.recall_card_states.due,
      })
      .from(dbm.drizzleSchema.recall_card_states)
      .where(eq(dbm.drizzleSchema.recall_card_states.card_id, cardId))
      .limit(1);
    return row;
  }

  it("同一 clientKey 的跨秒重试只写 1 条日志、只推进一次调度", async () => {
    const ids = await seedDeck("client-key-same", [listCard("k1")]);
    const cardId = ids.get("k1")!;
    const firstAt = new Date("2026-03-01T02:00:00.000Z");

    const first = await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
      clientKey: "client-key-1",
      now: firstAt,
    });
    // 5 秒后重试：ts 已经不同，0013 的秒级唯一索引**挡不住**，只能靠 client_key
    const retry = await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
      clientKey: "client-key-1",
      now: new Date(firstAt.getTime() + 5_000),
    });

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.rating).toBe(first.rating);
    expect(retry.nextDue).toBe(first.nextDue);
    expect(retry.pendingItems).toEqual(first.pendingItems);

    const logs = await readLogs(cardId);
    expect(logs).toHaveLength(1);
    expect(logs[0].client_key).toBe("client-key-1");

    const state = await readState(cardId);
    expect(state.reps).toBe(1);
    expect(state.due).toBe(first.nextDue);
  });

  it("不同 clientKey 是两次独立作答，各自写一条日志", async () => {
    const ids = await seedDeck("client-key-diff", [listCard("k2")]);
    const cardId = ids.get("k2")!;
    const base = new Date("2026-03-02T02:00:00.000Z");

    await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
      clientKey: "client-key-a",
      now: base,
    });
    await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
      clientKey: "client-key-b",
      now: new Date(base.getTime() + 60_000),
    });

    const logs = await readLogs(cardId);
    expect(logs).toHaveLength(2);

    const state = await readState(cardId);
    expect(state.reps).toBe(2);
  });

  it("不传 clientKey 时行为与以前一致（旧客户端兼容）", async () => {
    const ids = await seedDeck("client-key-none", [listCard("k3")]);
    const cardId = ids.get("k3")!;

    await recallService.submitReview(USER_A, cardId, {
      typed: "建立安全制度",
      now: new Date("2026-03-03T02:00:00.000Z"),
    });

    const logs = await readLogs(cardId);
    expect(logs).toHaveLength(1);
    expect(logs[0].client_key).toBeNull();
  });
});

describe("鉴权", () => {
  it("未登录时队列 action 报错而不是返回空数据", async () => {
    authState.user = null;

    const result = await actions.getRecallQueueAction();

    expect(result?.data).toBeUndefined();
    expect(result?.serverError).toContain("未登录");
  });

  it("未登录时写操作同样被拦", async () => {
    authState.user = null;

    const result = await actions.saveRecallCardAction({
      deckKey: "deck-any",
      cardId: "any",
      prompt: "题干",
      kind: "list",
      items: [{ text: "条目", keywords: ["条目"] }],
    });

    expect(result?.data).toBeUndefined();
    expect(result?.serverError).toContain("未登录");
  });
});
