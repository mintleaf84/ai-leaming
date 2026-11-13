/**
 * 回忆自测服务层（P2）：今日队列、取卡、提交判分、归档。
 *
 * 边界：
 * - 卡片内容是**全局共享**的（`recall_decks` / `recall_cards` 不带 user_id），
 *   进度与日志按用户隔离（`recall_card_states` / `recall_review_logs`）；
 * - 判分是确定性的（`../recall/matcher`），本层只负责"取内容 → 判 → 落库"；
 * - 一次提交的**日志与状态必须在同一个事务里**：日志是判分质量与后续算法升级的
 *   唯一数据源，状态是调度依据，缺任何一个都会让"两张表对不上"变成静默数据损坏。
 *
 * 幂等键两层（都由唯一索引兜底，见 drizzle/0013、0014）：
 * - `(user_id, card_id, ts 截到秒)` 挡住同一秒内的双击；
 * - `(user_id, client_key)` 挡住跨秒重试：客户端每个作答带一个 UUID，服务端先查
 *   日志，命中就当作重放（不写日志、不推进调度），查不到才正常写入。
 * 写入侧仍然**先插日志**：插入被冲突吞掉（`returning` 为空）说明并发竞态里已经
 * 有另一条落库，直接跳过状态更新并返回库里的现状，不需要"先查后写"的竞态窗口。
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "../db";
import { safeParseJson } from "../utils/json";
import { gradeCloze, gradeList } from "../recall/matcher";
import {
  clampNewLimit,
  RECALL_DEFAULT_NEW_PER_DAY,
  buildDailyQueue,
  type RecallDailyQueue,
} from "../recall/queue";
import { deriveRating } from "../recall/rating";
import {
  applyReview,
  computePendingItems,
  type RecallGradedItem,
  type RecallStateColumns,
} from "../recall/scheduler";
import type {
  RecallBlank,
  RecallCardKind,
  RecallDerivedRating,
  RecallItemVerdict,
  RecallListItem,
  RecallMode,
  RecallUserOverride,
} from "../recall/types";

const { recall_cards, recall_decks, recall_card_states, recall_review_logs } =
  drizzleSchema;
const { system_settings } = drizzleSchema;

/** 新卡每日额度的设置键（值域 0–15，缺省 6） */
export const RECALL_NEW_LIMIT_SETTING_KEY = "recall_new_cards_per_day";

export class RecallServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecallServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `pending_items` 列 → 数组；脏数据按"没有 pending"处理（不阻断整卡） */
function parsePendingItems(value: string | null): number[] | null {
  const parsed = safeParseJson<unknown>(value, null);
  if (!Array.isArray(parsed)) return null;
  const indexes = parsed
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
  return indexes.length > 0 ? indexes : null;
}

function serializePendingItems(value: number[] | null): string | null {
  return value && value.length > 0 ? JSON.stringify(value) : null;
}

function toStateColumns(row: {
  due: string | null;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  last_review: string | null;
}): RecallStateColumns {
  return {
    due: row.due ?? new Date(0).toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    state: row.state,
    reps: row.reps,
    lapses: row.lapses,
    last_review: row.last_review,
  };
}

/** 该用户在该卡上的完整状态快照（含重测条目与归档标记） */
export interface RecallCardStateSnapshot extends RecallStateColumns {
  pendingItems: number[] | null;
  archived: boolean;
}

export interface RecallCardView {
  cardId: number;
  cardKey: string;
  deckId: number;
  deckKey: string;
  kind: RecallCardKind;
  groupKey: string | null;
  prompt: string;
  items: RecallListItem[] | null;
  blanks: RecallBlank[] | null;
  verbatim: boolean;
  /** 没有任何复习记录时是 null（= 新卡） */
  state: RecallCardStateSnapshot | null;
  /** 卡组标题（作答页顶部要显示「回忆 · 教育法规」这类小字） */
  deckTitle: string;
}

async function readNewLimit(userId: number): Promise<number> {
  const [row] = await drizzleDb
    .select({ value: system_settings.value })
    .from(system_settings)
    .where(
      and(
        eq(system_settings.user_id, userId),
        eq(system_settings.key, RECALL_NEW_LIMIT_SETTING_KEY),
      ),
    )
    .limit(1);

  if (!row?.value) return RECALL_DEFAULT_NEW_PER_DAY;
  return clampNewLimit(Number.parseInt(row.value, 10));
}

/** 今日队列（新卡额度取用户设置，缺省 6；调用方也可显式指定） */
export async function getTodayQueue(
  userId: number,
  options: { newLimit?: number; now?: Date } = {},
): Promise<RecallDailyQueue> {
  const newLimit =
    options.newLimit === undefined
      ? await readNewLimit(userId)
      : clampNewLimit(options.newLimit);
  return buildDailyQueue(userId, { newLimit, now: options.now });
}

/** 取卡片内容 + 该用户的状态（重测只呈现 pendingItems，由 UI 决定） */
export async function getCard(
  userId: number,
  cardId: number,
): Promise<RecallCardView> {
  const [row] = await drizzleDb
    .select({
      cardId: recall_cards.id,
      cardKey: recall_cards.card_key,
      deckId: recall_cards.deck_id,
      deckKey: recall_decks.deck_key,
      deckTitle: recall_decks.title,
      kind: recall_cards.kind,
      groupKey: recall_cards.group_key,
      prompt: recall_cards.prompt,
      itemsJson: recall_cards.items_json,
      blanksJson: recall_cards.blanks_json,
      verbatim: recall_cards.verbatim,
    })
    .from(recall_cards)
    .innerJoin(recall_decks, eq(recall_decks.id, recall_cards.deck_id))
    .where(eq(recall_cards.id, cardId))
    .limit(1);

  if (!row) {
    throw new RecallServiceError(`卡片不存在：${cardId}`);
  }

  const [stateRow] = await drizzleDb
    .select()
    .from(recall_card_states)
    .where(
      and(
        eq(recall_card_states.user_id, userId),
        eq(recall_card_states.card_id, cardId),
      ),
    )
    .limit(1);

  return {
    cardId: row.cardId,
    cardKey: row.cardKey,
    deckId: row.deckId,
    deckKey: row.deckKey,
    deckTitle: row.deckTitle,
    kind: row.kind,
    groupKey: row.groupKey,
    prompt: row.prompt,
    items:
      row.kind === "list"
        ? safeParseJson<RecallListItem[]>(row.itemsJson, [])
        : null,
    blanks:
      row.kind === "cloze"
        ? safeParseJson<RecallBlank[]>(row.blanksJson, [])
        : null,
    verbatim: row.verbatim === 1,
    state: stateRow
      ? {
          ...toStateColumns(stateRow),
          pendingItems: parsePendingItems(stateRow.pending_items),
          archived: stateRow.archived === 1,
        }
      : null,
  };
}

export interface RecallSubmitOptions {
  typed: string;
  /** 不传则按 `pendingItems` 推断：有 pending = retest，否则 first */
  mode?: RecallMode;
  /** 用户改判（index 与 pendingItems 同一坐标系：**卡内条目下标**） */
  overrides?: RecallUserOverride[];
  /** 用户点了「全没想起」 */
  allBlank?: boolean;
  /**
   * 客户端幂等键（进入判分屏时生成的 UUID）。
   *
   * 秒级 `ts` 只能挡住"同一秒"的重试；超过一秒的重复提交会再写一条日志并把
   * FSRS 调度推进第二次。带上 clientKey 后，服务端先按 `(user_id, client_key)`
   * 查日志，命中就当作重放：不写日志、不动状态，直接回那一次的结果。
   */
  clientKey?: string;
  /** 供测试/补录用；生产不传（默认 now） */
  now?: Date;
}

export interface RecallSubmitResult {
  cardId: number;
  mode: RecallMode;
  /** 最终判分（已应用改判），与 itemIndexes 一一对应 */
  verdicts: RecallItemVerdict[];
  itemIndexes: number[];
  keywordHits: number;
  keywordTotal: number;
  rating: RecallDerivedRating;
  nextDue: string;
  pendingItems: number[] | null;
  /** 同一 (user, card, 秒) 的重复提交：本次未写任何行 */
  duplicate: boolean;
}

function applyOverrides(
  itemIndexes: number[],
  verdicts: RecallItemVerdict[],
  overrides: RecallUserOverride[] | undefined,
): RecallItemVerdict[] {
  if (!overrides || overrides.length === 0) return verdicts;

  const final = [...verdicts];
  for (const override of overrides) {
    if (!isRecord(override)) {
      throw new RecallServiceError("改判项必须是 { index, to } 对象");
    }
    const position = itemIndexes.indexOf(override.index);
    if (position < 0) {
      throw new RecallServiceError(
        `改判下标 ${String(override.index)} 不在本次呈现的条目里（${itemIndexes.join(",")}）`,
      );
    }
    if (override.to !== "ok" && override.to !== "miss") {
      throw new RecallServiceError(
        `改判取值非法：${String(override.to)}（只接受 ok / miss）`,
      );
    }
    final[position] = override.to;
  }
  return final;
}

/** 只保留落在 `[0, total)` 里的条目下标（脏 pendingItems 的唯一清洗入口） */
function normalizeItemIndexes(
  indexes: number[] | null | undefined,
  total: number,
): number[] {
  if (!indexes) return [];
  return indexes.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < total,
  );
}

function isDerivedRating(value: unknown): value is RecallDerivedRating {
  return value === "again" || value === "hard" || value === "good";
}

/**
 * 按客户端幂等键取回**已经落库**的那次提交。
 *
 * 命中时只读不写：日志不再插、`recall_card_states` 不再推进 —— 这正是
 * 「跨秒重试」要解决的问题（0013 的秒级唯一索引只挡住了同一秒）。
 *
 * 关于 `verdicts` / `itemIndexes`：重测那次的**原始呈现集合**会随调度推进从状态行
 * 里消失（`pending_items` 已被这次提交改写成新值），日志里也没有单独存它。因此
 * 重放时按下标顺序还原（`itemIndexes = 0..n-1`）；`verdicts` 的顺序仍与那次呈现
 * 一一对应，只是「卡内下标」在重测重放里不再精确。对外接口不返回 `itemIndexes`，
 * 判分质量统计与调度都以日志 + 状态行为准，不受这个近似影响。
 */
async function replayByClientKey(
  userId: number,
  cardId: number,
  clientKey: string,
  context: { state: RecallCardStateSnapshot | null },
): Promise<RecallSubmitResult | null> {
  const [row] = await drizzleDb
    .select({
      cardId: recall_review_logs.card_id,
      mode: recall_review_logs.mode,
      algoVerdicts: recall_review_logs.algo_verdicts,
      userOverrides: recall_review_logs.user_overrides,
      keywordHits: recall_review_logs.keyword_hits,
      keywordTotal: recall_review_logs.keyword_total,
      rating: recall_review_logs.derived_rating,
      fsrsAfter: recall_review_logs.fsrs_after,
    })
    .from(recall_review_logs)
    .where(
      and(
        eq(recall_review_logs.user_id, userId),
        eq(recall_review_logs.client_key, clientKey),
      ),
    )
    .limit(1);

  // 同一个 key 被用到了别的卡上：说明客户端复用错了 key，不能当成这张卡的重放
  // （否则会把 A 卡的结论显示在 B 卡上）。让它走正常写入，由唯一索引兜并发。
  if (!row || row.cardId !== cardId) return null;

  const algoVerdicts = safeParseJson<RecallItemVerdict[]>(
    row.algoVerdicts,
    [],
  ).map((verdict): RecallItemVerdict => (verdict === "ok" ? "ok" : "miss"));
  const itemIndexes = algoVerdicts.map((_, index) => index);
  const verdicts = [...algoVerdicts];
  for (const override of safeParseJson<RecallUserOverride[]>(
    row.userOverrides,
    [],
  )) {
    if (!isRecord(override)) continue;
    if (override.to !== "ok" && override.to !== "miss") continue;
    const position = itemIndexes.indexOf(Number(override.index));
    if (position >= 0) verdicts[position] = override.to;
  }

  // due 以那一次写下的 fsrs_after 为准（之后可能又被复习过，状态行已不是它的）
  const loggedState = safeParseJson<RecallStateColumns | null>(
    row.fsrsAfter,
    null,
  );
  const nextDue = loggedState?.due ?? context.state?.due;
  if (!nextDue) {
    throw new RecallServiceError(
      `日志 ${clientKey} 缺少调度快照，无法回放这次提交`,
    );
  }

  return {
    cardId,
    mode: row.mode === "retest" ? "retest" : "first",
    verdicts,
    itemIndexes,
    keywordHits: Number(row.keywordHits) || 0,
    keywordTotal: Number(row.keywordTotal) || 0,
    rating: isDerivedRating(row.rating) ? row.rating : "hard",
    nextDue,
    pendingItems: context.state?.pendingItems ?? null,
    duplicate: true,
  };
}

/** 提交一次作答：判分 → 推导评分 → 写日志 + 更新状态（单事务） */
export async function submitReview(
  userId: number,
  cardId: number,
  options: RecallSubmitOptions,
): Promise<RecallSubmitResult> {
  const card = await getCard(userId, cardId);
  const priorPending = card.state?.pendingItems ?? null;

  // 客户端幂等键命中：这次提交早就落过库（例如响应丢了、用户又按了一次）。
  // 必须在这里短路，否则下面的调度会再推进一次。
  if (options.clientKey) {
    const replay = await replayByClientKey(userId, cardId, options.clientKey, {
      state: card.state,
    });
    if (replay) return replay;
  }

  const allIndexes =
    card.kind === "list"
      ? (card.items ?? []).map((_, index) => index)
      : (card.blanks ?? []).map((_, index) => index);

  // 重测下标必须按**当前**条目数过滤：卡片被编辑（删掉几条）后库里的
  // pendingItems 可能指向已不存在的下标，直接拿去呈现会让 getCard 之后
  // 的判分抛错、或把用户锁死在重测里。过滤后为空就退回「首发」。
  let mode: RecallMode =
    options.mode ??
    (priorPending && priorPending.length > 0 ? "retest" : "first");
  let presentedIndexes = allIndexes;
  if (mode === "retest") {
    const validPending = normalizeItemIndexes(priorPending, allIndexes.length);
    if (validPending.length > 0) {
      presentedIndexes = validPending;
    } else {
      mode = "first";
    }
  }
  const priorPendingForSchedule =
    mode === "retest"
      ? normalizeItemIndexes(priorPending, allIndexes.length)
      : null;

  if (presentedIndexes.length === 0) {
    throw new RecallServiceError(`卡片 ${card.cardKey} 没有可判分的条目`);
  }

  const { algoVerdicts, keywordHits, keywordTotal } = gradeCard(
    card,
    presentedIndexes,
    options.typed,
  );
  const verdicts = applyOverrides(
    presentedIndexes,
    algoVerdicts,
    options.overrides,
  );
  const rating = deriveRating(verdicts, options.allBlank ?? false);

  const now = options.now ?? new Date();
  // 幂等键精确到秒：同一秒内的重放（双击、网络重试）只落一条日志
  const reviewedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const ts = reviewedAt.toISOString();

  const prevColumns = card.state ? toStateColumns(card.state) : null;
  const applied = applyReview(prevColumns, rating, reviewedAt);

  // 「全没想起」时所有条目都算没写：重测要重放整张卡，不能因为文本里恰好
  // 命中了某个关键词就把条目从 pendingItems 里漏掉
  const pendingVerdicts: RecallItemVerdict[] = options.allBlank
    ? presentedIndexes.map(() => "miss")
    : verdicts;
  const graded: RecallGradedItem[] = presentedIndexes.map(
    (index, position) => ({
      index,
      verdict: pendingVerdicts[position],
    }),
  );
  const pendingItems = computePendingItems(
    mode,
    graded,
    priorPendingForSchedule,
  );

  const base: Omit<RecallSubmitResult, "duplicate"> = {
    cardId,
    mode,
    verdicts,
    itemIndexes: [...presentedIndexes],
    keywordHits,
    keywordTotal,
    rating,
    nextDue: applied.next.due,
    pendingItems,
  };

  return drizzleDb.transaction(async (tx) => {
    // 事务内一律走 tx：用全局 drizzleDb 会让语句跑在事务连接之外
    const exec = tx as unknown as typeof drizzleDb;

    const inserted = await exec
      .insert(recall_review_logs)
      .values({
        user_id: userId,
        card_id: cardId,
        ts,
        mode,
        algo_verdicts: JSON.stringify(algoVerdicts),
        user_overrides:
          options.overrides && options.overrides.length > 0
            ? JSON.stringify(options.overrides)
            : null,
        keyword_hits: keywordHits,
        keyword_total: keywordTotal,
        derived_rating: rating,
        typed_answer: options.typed,
        fsrs_before: JSON.stringify(applied.log.before),
        fsrs_after: JSON.stringify(applied.log.after),
        client_key: options.clientKey ?? null,
      })
      // 唯一索引 (user_id, card_id, ts) 冲突 = 同一秒重复提交；
      // (user_id, client_key) 冲突 = 同一个客户端 key 的并发重试（预检查漏掉的竞态）
      .onConflictDoNothing()
      .returning({ id: recall_review_logs.id });

    if (inserted.length === 0) {
      // 重放：不碰状态，返回库里已经落下的结果（pendingItems / due 以库为准）
      const [existing] = await exec
        .select()
        .from(recall_card_states)
        .where(
          and(
            eq(recall_card_states.user_id, userId),
            eq(recall_card_states.card_id, cardId),
          ),
        )
        .limit(1);

      return {
        ...base,
        nextDue: existing?.due ?? base.nextDue,
        pendingItems: existing
          ? parsePendingItems(existing.pending_items)
          : base.pendingItems,
        duplicate: true,
      };
    }

    await exec
      .insert(recall_card_states)
      .values({
        user_id: userId,
        card_id: cardId,
        ...applied.next,
        pending_items: serializePendingItems(pendingItems),
        archived: 0,
      })
      .onConflictDoUpdate({
        target: [recall_card_states.user_id, recall_card_states.card_id],
        // 有意不动 archived：复习一张已归档的卡不应把它悄悄放回队列
        set: {
          ...applied.next,
          pending_items: serializePendingItems(pendingItems),
          updated_at: sql`CURRENT_TIMESTAMP`,
        },
      });

    return { ...base, duplicate: false };
  });
}

/** 按卡片类型判分（重测只判呈现出来的条目） */
function gradeCard(
  card: RecallCardView,
  presentedIndexes: number[],
  typed: string,
): {
  algoVerdicts: RecallItemVerdict[];
  keywordHits: number;
  keywordTotal: number;
} {
  if (card.kind === "list") {
    const result = gradeList(
      {
        cardId: card.cardKey,
        kind: "list",
        prompt: card.prompt,
        items: card.items ?? [],
        verbatim: card.verbatim,
      },
      typed,
      { itemIndexes: presentedIndexes },
    );
    return {
      algoVerdicts: result.verdicts,
      keywordHits: result.keywordHits,
      keywordTotal: result.keywordTotal,
    };
  }

  const blanks = card.blanks ?? [];
  const subset = presentedIndexes.map((index) => {
    const blank = blanks[index];
    if (!blank) {
      throw new RecallServiceError(
        `填空卡 ${card.cardKey} 不存在空位下标 ${index}（共 ${blanks.length} 个空）`,
      );
    }
    return blank;
  });

  // 只判呈现出来的那几个空：用户在重测界面只看到它们，输入也按这个顺序分段
  const { verdicts } = gradeCloze(
    {
      cardId: card.cardKey,
      kind: "cloze",
      prompt: card.prompt,
      blanks: subset,
    },
    typed,
  );

  return {
    algoVerdicts: verdicts,
    keywordHits: verdicts.filter((verdict) => verdict === "ok").length,
    keywordTotal: verdicts.length,
  };
}

/** 归档：移出队列但保留全部历史（状态行不存在时补一条，避免它又回新卡池） */
export async function archiveCard(
  userId: number,
  cardId: number,
): Promise<void> {
  await assertCardExists(cardId);
  await drizzleDb
    .insert(recall_card_states)
    .values({ user_id: userId, card_id: cardId, archived: 1 })
    .onConflictDoUpdate({
      target: [recall_card_states.user_id, recall_card_states.card_id],
      set: { archived: 1, updated_at: sql`CURRENT_TIMESTAMP` },
    });
}

/**
 * 取消归档。
 *
 * 两种情形分开处理，否则会出现"取消归档后卡片永久消失"：
 * - 有复习记录（`reps > 0` 或 `last_review` 非空）：把 archived 置 0，回到到期队列；
 * - 从没复习过就被归档（空状态行）：**删除该行**，让它重新进入新卡池。
 *   若只把 archived 置 0，这张卡的 `due` 是 NULL、state 是 New，既不属于
 *   「到期」（due 为 NULL）也不属于「新卡」（有状态行了），会永远不出现在队列里。
 *
 * @returns 是否有可取消归档的状态行
 */
export async function unarchiveCard(
  userId: number,
  cardId: number,
): Promise<boolean> {
  const [row] = await drizzleDb
    .select({
      id: recall_card_states.id,
      reps: recall_card_states.reps,
      last_review: recall_card_states.last_review,
    })
    .from(recall_card_states)
    .where(
      and(
        eq(recall_card_states.user_id, userId),
        eq(recall_card_states.card_id, cardId),
      ),
    )
    .limit(1);

  if (!row) return false;

  if (row.reps === 0 && row.last_review === null) {
    await drizzleDb
      .delete(recall_card_states)
      .where(eq(recall_card_states.id, row.id));
    return true;
  }

  await drizzleDb
    .update(recall_card_states)
    .set({ archived: 0, updated_at: sql`CURRENT_TIMESTAMP` })
    .where(eq(recall_card_states.id, row.id));
  return true;
}

async function assertCardExists(cardId: number): Promise<void> {
  const [row] = await drizzleDb
    .select({ id: recall_cards.id })
    .from(recall_cards)
    .where(eq(recall_cards.id, cardId))
    .limit(1);
  if (!row) {
    throw new RecallServiceError(`卡片不存在：${cardId}`);
  }
}
