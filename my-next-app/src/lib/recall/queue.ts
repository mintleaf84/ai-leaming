/**
 * 每日队列（规格 §3 / §6 验收 6）。
 *
 * 口径（三条，缺一条队列就会失控）：
 * 1. **到期卡全取**：`due <= now` 且 `archived = 0`，按 due 升序（最早到期先做），
 *    due 相同按 card id 升序——顺序必须稳定，否则用户刷新一次顺序就变。
 *    重测卡也是普通到期卡（区别只在 UI 只呈现 `pendingItems` 条目），这里不单独处理。
 * 2. **新卡**：该用户**没有任何** `recall_card_states` 行的卡，按 card id 升序，
 *    每日额度 = 用户设置（0–15，默认 6）。
 * 3. **当日总量上限 15**：到期优先，新卡吃剩下的额度。
 *
 * 「跨学习日」的实现取舍——**不建 `recall_daily_counts` 表**：
 * 今日已消费的额度直接由 `recall_review_logs` 按学习日窗口（Asia/Shanghai 04:00）计数
 * 得到。理由：
 * - 队列因此是**纯查询**，重复调用幂等，不需要"今天是否已生成队列"的标记；
 * - 复习过的卡当天不会再到期（`enable_short_term: false`，最短间隔 1 天），
 *   所以"已复习数 + 剩余 due + 新卡"不会重复计算同一张卡；
 * - 唯一的表改动留给日志唯一索引（幂等），不再增加一张需要清理的日统计表。
 */
import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "../db";
import { getStudyDay, getStudyDayStart } from "./study-day";

const { recall_cards, recall_card_states, recall_review_logs } = drizzleSchema;

/** 新卡每日默认额度（规格 §3：新卡默认 ≤6 张/日） */
export const RECALL_DEFAULT_NEW_PER_DAY = 6;
/** 新卡每日硬上限（规格 §3：用户唯一可调项，0–15） */
export const RECALL_MAX_NEW_PER_DAY = 15;
/** 当日总量上限（规格 §3：补做上限 15 张/日，超出自动顺延） */
export const RECALL_MAX_DAILY_CARDS = 15;
/** 展示用估时：每卡约 0.4 分钟（只用于「回忆 4 张 · 约 2 分钟」这行小字） */
export const RECALL_MINUTES_PER_CARD = 0.4;

/** 把调用方传的额度夹到 0–15；非法值退回默认 6 */
export function clampNewLimit(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return RECALL_DEFAULT_NEW_PER_DAY;
  }
  return Math.min(RECALL_MAX_NEW_PER_DAY, Math.max(0, Math.floor(value)));
}

export interface RecallDailyQueue {
  /** 到期卡（含重测卡），按 due 升序 */
  due: number[];
  /** 今天投放的新卡，card id 升序 */
  fresh: number[];
  total: number;
  /** 展示用估时（分钟，向上取整） */
  estimatedMinutes: number;
}

export interface BuildDailyQueueOptions {
  /** 新卡每日额度（调用方按用户设置传入；这里再夹一次 0–15） */
  newLimit?: number;
  now?: Date;
}

/**
 * 构建「今天的队列」。纯查询：同一时刻重复调用结果一致。
 */
export async function buildDailyQueue(
  userId: number,
  options: BuildDailyQueueOptions = {},
): Promise<RecallDailyQueue> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const newQuota = clampNewLimit(options.newLimit);
  const dayStartIso = getStudyDayStart(getStudyDay(now)).toISOString();

  const [reviewedRow] = await drizzleDb
    .select({ total: sql<number>`count(*)` })
    .from(recall_review_logs)
    .where(
      and(
        eq(recall_review_logs.user_id, userId),
        gte(recall_review_logs.ts, dayStartIso),
      ),
    );
  const reviewedToday = Number(reviewedRow?.total ?? 0) || 0;
  const remainingBudget = Math.max(0, RECALL_MAX_DAILY_CARDS - reviewedToday);

  const dueRows = await drizzleDb
    .select({ cardId: recall_card_states.card_id })
    .from(recall_card_states)
    .innerJoin(recall_cards, eq(recall_cards.id, recall_card_states.card_id))
    .where(
      and(
        eq(recall_card_states.user_id, userId),
        eq(recall_card_states.archived, 0),
        isNotNull(recall_card_states.due),
        lte(recall_card_states.due, nowIso),
      ),
    )
    .orderBy(asc(recall_card_states.due), asc(recall_card_states.card_id));

  const freshRows = await drizzleDb
    .select({ cardId: recall_cards.id })
    .from(recall_cards)
    .leftJoin(
      recall_card_states,
      and(
        eq(recall_card_states.card_id, recall_cards.id),
        eq(recall_card_states.user_id, userId),
      ),
    )
    // 没有该用户的状态行 = 新卡（归档过的卡有状态行，天然被排除）
    .where(isNull(recall_card_states.id))
    .orderBy(asc(recall_cards.id));

  // 到期优先：先吃掉当日额度，剩下的才给新卡
  const due = dueRows.slice(0, remainingBudget).map((row) => row.cardId);
  const freshRoom = Math.max(0, remainingBudget - due.length);
  const fresh = freshRows
    .slice(0, Math.min(newQuota, freshRoom))
    .map((row) => row.cardId);

  const total = due.length + fresh.length;

  return {
    due,
    fresh,
    total,
    estimatedMinutes: Math.ceil(total * RECALL_MINUTES_PER_CARD),
  };
}
