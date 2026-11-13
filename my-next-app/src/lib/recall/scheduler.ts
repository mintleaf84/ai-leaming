/**
 * FSRS 调度（规格 §1.3 / §2.2）——把 ts-fsrs 的 `Card` 与我们表里的列互转。
 *
 * 为什么不做"自己算间隔"：规格 §6 验收 4 要求「评分推导与间隔严格等于 ts-fsrs
 * 默认参数、request_retention=0.9 的参考输出」。唯一可靠的实现方式就是**直接调**
 * ts-fsrs，然后逐字段对拍（见 `__tests__/scheduler.test.ts` 的 10 步序列）。
 *
 * 表里没有 `elapsed_days` / `scheduled_days` 两列，也不打算加（迁移 0013 只加日志
 * 唯一索引）：ts-fsrs v5 的 `Card.elapsed_days` 已标 `@deprecated`，调度时由
 * `last_review` 现算（`AbstractScheduler.init()`）；`scheduled_days` 只写进日志、
 * 不参与下一次计算。因此从列重建 Card 时：
 * - `elapsed_days = dateDiffInDays(last_review, now)`
 * - `scheduled_days = dateDiff(last_review, due)`
 * 两者都不影响 due/stability/difficulty/state/reps/lapses——这正是对拍测试要证明的事。
 */
import {
  Rating,
  State,
  createEmptyCard,
  dateDiffInDays,
  date_diff,
  type Card,
  type Grade,
} from "ts-fsrs";
import { createRecallScheduler } from "../srs/fsrs-config";
import type {
  RecallDerivedRating,
  RecallItemVerdict,
  RecallMode,
} from "./types";

/** `recall_card_states` 里与 FSRS 有关的那几列 */
export interface RecallStateColumns {
  due: string;
  stability: number;
  difficulty: number;
  /** 0 New / 1 Learning / 2 Review / 3 Relearning */
  state: number;
  reps: number;
  lapses: number;
  last_review: string | null;
}

/** 推导评分 → ts-fsrs 评分（**没有 Easy**，规格 §2.2） */
const RATING_MAP: Record<RecallDerivedRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

/**
 * 调度器实例：`fsrs()` 内部有可变状态（seed），模块内共享一个同步使用的实例。
 * `repeat()` 是同步纯计算（seed 每次按 review_time/reps/difficulty*stability 重置），
 * 因此单线程下共享安全；不要把它导出给其他模块复用。
 */
const scheduler = createRecallScheduler();

function toStateEnum(value: number, cardLabel: string): State {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${cardLabel} 的 state=${String(value)} 非法（只接受 0–3）`);
  }
  return value as State;
}

/** 初始状态：`createEmptyCard()` 映射到表列（New 卡、due=now） */
export function createInitialState(now: Date = new Date()): RecallStateColumns {
  return toColumns(createEmptyCard(now));
}

/** ts-fsrs Card → 表列（写入侧的唯一定义处） */
function toColumns(card: Card): RecallStateColumns {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/**
 * 表列 → ts-fsrs Card（读回后继续调度的入口）。
 *
 * `learning_steps` 固定 0：回忆自测用 `enable_short_term: false`，学习步永远为空，
 * 该字段不会被读取（见 `src/lib/srs/fsrs-config.ts` 的说明）。
 */
export function toFsrsCard(
  columns: RecallStateColumns | null,
  now: Date = new Date(),
): Card {
  if (!columns) return createEmptyCard(now);

  const due = new Date(columns.due);
  if (Number.isNaN(due.getTime())) {
    throw new Error(`卡片 due 非法：${columns.due}`);
  }
  const lastReview = columns.last_review ? new Date(columns.last_review) : null;
  if (lastReview && Number.isNaN(lastReview.getTime())) {
    throw new Error(`卡片 last_review 非法：${columns.last_review}`);
  }

  return {
    due,
    stability: columns.stability,
    difficulty: columns.difficulty,
    elapsed_days: lastReview ? Math.max(0, dateDiffInDays(lastReview, now)) : 0,
    scheduled_days: lastReview ? Math.max(0, date_diff(due, lastReview, "days")) : 0,
    learning_steps: 0,
    reps: columns.reps,
    lapses: columns.lapses,
    state: toStateEnum(columns.state, "卡片"),
    last_review: lastReview ?? undefined,
  };
}

export interface RecallReviewLogFsrs {
  /** 本次复习前的状态快照（与表列同构，可直接回滚/重放） */
  before: RecallStateColumns;
  /** 本次复习后的状态快照 */
  after: RecallStateColumns;
}

export interface ApplyReviewResult {
  next: RecallStateColumns;
  log: RecallReviewLogFsrs;
}

/**
 * 应用一次评分。
 *
 * @param prev 该卡上一次的状态；`null` = 首次作答（New 卡）
 * @param rating 推导评分（again | hard | good）
 * @param now 本次复习时刻（调度与 due 都以它为基准）
 */
export function applyReview(
  prev: RecallStateColumns | null,
  rating: RecallDerivedRating,
  now: Date = new Date(),
): ApplyReviewResult {
  const card = toFsrsCard(prev, now);
  const record = scheduler.next(card, now, RATING_MAP[rating]);

  return {
    next: toColumns(record.card),
    log: {
      before: toColumns(card),
      after: toColumns(record.card),
    },
  };
}

/** 单条判分结果（含**卡内**下标，重测时与 pendingItems 同一坐标系） */
export interface RecallGradedItem {
  index: number;
  verdict: RecallItemVerdict;
}

/**
 * 计算新的 `pendingItems`（规格 §1.3：上次错的条目序号，重测只呈现这些）。
 *
 * - 首发：全对 → `null`（清空）；否则记下这次错的条目下标；
 * - 重测：全对 → `null`；仍有错 → 取「上次错的」与「这次仍错的」**交集**
 *   （重测只呈现上次错的条目，交集天然等于这次错的集合；写成交集是为了防止
 *   历史 pendingItems 里混进了已不存在的下标时把整卡锁死）；
 * - 交集为空但仍有错（历史下标已失效）→ 退化为这次错的条目，保证不会"错着却清空"。
 */
export function computePendingItems(
  mode: RecallMode,
  results: RecallGradedItem[],
  prevPending: number[] | null,
): number[] | null {
  const missed = results
    .filter((item) => item.verdict === "miss")
    .map((item) => item.index)
    .sort((a, b) => a - b);

  if (missed.length === 0) return null;
  if (mode === "first") return missed;

  const previous = prevPending ?? [];
  if (previous.length === 0) return missed;

  const previousSet = new Set(previous);
  const intersection = missed.filter((index) => previousSet.has(index));
  return intersection.length > 0 ? intersection : missed;
}

/** 该卡下次是否应该走重测（有 pendingItems = 上次有错） */
export function isRetestDue(pendingItems: number[] | null): boolean {
  return Boolean(pendingItems && pendingItems.length > 0);
}
