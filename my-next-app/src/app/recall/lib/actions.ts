/**
 * 回忆自测：Server Action 的客户端适配层。
 *
 * 为什么需要这一层（两个理由，都不是"多包一层好维护"）：
 *
 * 1. **safe-action 的失败不抛异常**。`xxxAction()` 正常返回 `{ data }`，失败返回
 *    `{ serverError }` 或 `{ validationErrors }`（见 docs/error-handling.md 客户端第 6 条）。
 *    直接 `const queue = await getRecallQueueAction()` 会在失败时把 `undefined` 当数据用，
 *    界面于是"假装成功"。这里统一把三种形态折成「有数据 → 返回；否则 → throw」，
 *    调用方只需要 try/catch 一处。
 * 2. **运行时形状校验**。队列是「今天做几张」的唯一依据，`due`/`fresh` 必须是卡片编号
 *    数组才能逐张取卡。只拿到计数而拿不到编号时，宁可报错也不能显示成「今天没有卡」——
 *    那会让用户以为做完了一天。同样的理由适用于 `verdicts` 与 `nextReviewText`。
 *
 * 判分预览**不在这里**：见 `./preview.ts`（复用 `@/lib/recall/matcher` 的确定性规则，
 * 保证「确认结果」提交前用户看到的绿/黄与服务端算的一致）。
 */

import {
  archiveRecallCardAction,
  deleteRecallCardAction,
  getRecallCardAction,
  getRecallQueueAction,
  importRecallDeckAction,
  saveRecallCardAction,
  submitRecallReviewAction,
} from "@/server/actions/recall";

/** 卡片编号：与 `recall_cards.id` 一致（P2 起队列返回的就是数据库 id） */
export type RecallCardId = number;

export type RecallVerdict = "ok" | "miss";
export type RecallRating = "again" | "hard" | "good";

/** 作答屏要展示的条目（`keywords` 缺失时预览判分退化为整条文本匹配） */
export interface RecallItemView {
  text: string;
  keywords?: string[];
}

export interface RecallQueueView {
  total: number;
  /** 本次队列的卡片编号（顺序 = 到期优先，再新卡）；action 不回编号时为空数组 */
  ids: RecallCardId[];
  /** 队列里的卡片编号（按来源拆分；action 只回计数时为空，由调用方用服务端快照兜底） */
  dueIds: RecallCardId[];
  freshIds: RecallCardId[];
  dueCount: number;
  freshCount: number;
  estimatedMinutes: number;
  streakDays: number;
}

export interface RecallCardView {
  cardId: RecallCardId;
  deckTitle: string;
  kind: "list" | "cloze";
  prompt: string;
  /** 列举卡：整卡条目（重测时用 `pendingItems` 从中挑） */
  items: RecallItemView[] | null;
  blanks: { answers: string[] }[] | null;
  /** 上次判「未写」的条目下标；非重测为 null */
  pendingItems: number[] | null;
  mode: "first" | "retest";
}

export interface RecallSubmitView {
  verdicts: RecallVerdict[];
  rating: RecallRating;
  nextDue: string;
  pendingItems: number[] | null;
  /** 「下次 11 月 20 日」/「明天只重测这 3 条」——直接展示，不在 UI 里重新算日期 */
  nextReviewText: string;
}

export interface RecallImportView {
  deckKey: string;
  createdCards: number;
  updatedCards: number;
  skippedCards: number;
  /**
   * 内容冲突的卡及其处理方式：`keep` = 保库内旧内容（既不算新增也不算更新，
   * 也不算跳过），`accept` = 已用文件覆盖（已计入 `updatedCards`）。
   * 完成态要靠它把「保留 N 张」补进数字账，否则各项之和小于文件卡数。
   */
  conflicts: { cardId: string; action: RecallImportConflictAction }[];
  missingInFile: string[];
}

/** 冲突处理方式（与服务层 `RecallImportConflict.action` 同口径） */
export type RecallImportConflictAction = "keep" | "accept";

export interface RecallDeckCardDraft {
  deckKey: string;
  cardId: string;
  prompt: string;
  kind: "list" | "cloze";
  items?: { text: string; keywords: string[] }[];
  blanks?: { answers: string[] }[];
  /** 不传 = 沿用库里的旧值（编辑器不暴露开关，保存时不能把它清掉） */
  verbatim?: boolean;
}

/** safe-action 的三种返回形态（成功 / 服务端错误 / 参数校验失败） */
interface ActionEnvelope<T> {
  data?: T;
  serverError?: string;
  validationErrors?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 调用一个 Server Action 并取出数据。
 *
 * 裸对象返回（`"use server"` 直接导出的普通函数）与 `{ data }` 返回都接受：
 * 判据是「有没有 safe-action 的包装键」，而不是「有没有 data」——后者会把
 * 自带 `data` 字段的业务返回值误判成包装层。
 */
async function runAction<T>(
  run: () => Promise<unknown>,
  failureMessage: string,
): Promise<T> {
  const result = await run();
  if (isRecord(result)) {
    const envelope = result as ActionEnvelope<T>;
    if (envelope.data !== undefined) return envelope.data;
    if ("serverError" in result || "validationErrors" in result) {
      const detail =
        typeof envelope.serverError === "string" ? envelope.serverError : "";
      throw new Error(detail.trim() || failureMessage);
    }
  }
  if (result === undefined || result === null) {
    throw new Error(failureMessage);
  }
  return result as T;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** 卡片编号数组；字符串数字也接受（服务层可能把 bigint/text 转成字符串） */
function asCardIds(value: unknown): RecallCardId[] {
  if (!Array.isArray(value)) return [];
  const ids: RecallCardId[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? Number(item) : item;
    if (typeof id === "number" && Number.isInteger(id) && id > 0) {
      ids.push(id);
    }
  }
  return ids;
}

function asIndexes(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const indexes = value.filter(
    (item): item is number =>
      typeof item === "number" && Number.isInteger(item),
  );
  return indexes.length > 0 ? indexes : null;
}

function asVerdicts(value: unknown): RecallVerdict[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (item === "ok" ? "ok" : "miss"));
}

export function isRecallRating(value: unknown): value is RecallRating {
  return value === "again" || value === "hard" || value === "good";
}

/** 错误 → 一句能直接给用户看的话（toast/ErrorState 用，过长截断） */
export function actionErrorMessage(
  error: unknown,
  fallback = "网络异常，请稍后再试",
): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const summary = message || fallback;
  return summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;
}

/** ISO → 「下次 11 月 20 日」；只作为 action 没给文案时的兜底 */
function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `下次 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export async function fetchRecallQueue(): Promise<RecallQueueView> {
  const raw = await runAction<Record<string, unknown>>(
    () => getRecallQueueAction(),
    "没有取到今天的回忆队列",
  );

  // `due` / `fresh` 是**计数**（旧形状），编号优先取 `ids`；两者都接受，便于灰度。
  const ids = asCardIds(raw.ids);
  const dueIds = asCardIds(raw.due);
  const freshIds = asCardIds(raw.fresh);
  const dueCount = Array.isArray(raw.due) ? dueIds.length : asNumber(raw.due);
  const freshCount = Array.isArray(raw.fresh)
    ? freshIds.length
    : asNumber(raw.fresh);

  return {
    total: asNumber(raw.total) || dueCount + freshCount,
    ids: ids.length > 0 ? ids : [...dueIds, ...freshIds],
    dueIds,
    freshIds,
    dueCount,
    freshCount,
    estimatedMinutes: asNumber(raw.estimatedMinutes),
    streakDays: asNumber(raw.streakDays),
  };
}

export async function fetchRecallCard(
  cardId: RecallCardId,
): Promise<RecallCardView> {
  const raw = await runAction<Record<string, unknown>>(
    () => getRecallCardAction({ cardId }),
    "没有取到这张卡",
  );

  const kind = raw.kind === "cloze" ? "cloze" : "list";
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isRecord).map((item) => ({
        text: asText(item.text),
        keywords: Array.isArray(item.keywords)
          ? item.keywords.filter((k): k is string => typeof k === "string")
          : undefined,
      }))
    : null;
  const blanks = Array.isArray(raw.blanks)
    ? raw.blanks.filter(isRecord).map((blank) => ({
        answers: Array.isArray(blank.answers)
          ? blank.answers.filter((a): a is string => typeof a === "string")
          : [],
      }))
    : null;

  const pendingItems = asIndexes(raw.pendingItems);

  return {
    cardId: asNumber(raw.cardId) || cardId,
    deckTitle: asText(raw.deckTitle),
    kind,
    prompt: asText(raw.prompt),
    items,
    blanks,
    pendingItems,
    mode: raw.mode === "retest" || pendingItems ? "retest" : "first",
  };
}

export interface RecallSubmitInput {
  cardId: RecallCardId;
  typed: string;
  allBlank?: boolean;
  overrides?: { index: number; to: RecallVerdict }[];
  /** 幂等键：进入判分屏时生成，重试沿用同一个（跨秒重试才不会重复写日志） */
  clientKey?: string;
}

export async function submitRecall(
  input: RecallSubmitInput,
): Promise<RecallSubmitView> {
  const raw = await runAction<Record<string, unknown>>(
    () => submitRecallReviewAction(input),
    "这次作答没有保存成功",
  );

  const rating = isRecallRating(raw.rating) ? raw.rating : "hard";
  const nextDue = asText(raw.nextDue);
  const nextReviewText =
    asText(raw.nextReviewText).trim() || formatDue(nextDue);

  return {
    verdicts: asVerdicts(raw.verdicts),
    rating,
    nextDue,
    pendingItems: asIndexes(raw.pendingItems),
    nextReviewText,
  };
}

export async function archiveRecallCard(
  cardId: RecallCardId,
  archived: boolean,
): Promise<void> {
  await runAction<unknown>(
    () => archiveRecallCardAction({ cardId, archived }),
    "归档没有成功",
  );
}

export async function importRecallDeck(
  json: string,
  onConflict?: "keep" | "accept",
): Promise<RecallImportView> {
  const raw = await runAction<Record<string, unknown>>(
    () => importRecallDeckAction({ json, onConflict }),
    "卡组没有导入成功",
  );

  return {
    deckKey: asText(raw.deckKey),
    createdCards: asNumber(raw.createdCards),
    updatedCards: asNumber(raw.updatedCards),
    skippedCards: asNumber(raw.skippedCards),
    conflicts: Array.isArray(raw.conflicts)
      ? raw.conflicts.filter(isRecord).map((conflict) => ({
          cardId: asText(conflict.cardId),
          // 服务层只产出 keep / accept；未知值按 keep 处理更保守（不会凭空报「已覆盖」）
          action: conflict.action === "accept" ? "accept" : "keep",
        }))
      : [],
    missingInFile: Array.isArray(raw.missingInFile)
      ? raw.missingInFile.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export async function saveRecallCard(
  draft: RecallDeckCardDraft,
): Promise<void> {
  await runAction<unknown>(
    () => saveRecallCardAction(draft),
    "卡片没有保存成功",
  );
}

export async function deleteRecallCard(
  deckKey: string,
  cardId: string,
): Promise<void> {
  await runAction<unknown>(
    () => deleteRecallCardAction({ deckKey, cardId }),
    "卡片没有删除成功",
  );
}
