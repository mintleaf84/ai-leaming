"use server";

/**
 * 回忆自测 Server Actions（P3 服务端接线）。
 *
 * 边界：
 * - `userId` **只从登录态取**（`ctx.user.id`），签名里不接受调用方传 userId：
 *   卡片内容全局共享，但进度与日志按用户隔离，越权就等于串进度；
 * - 这里只做「参数校验 + 调用服务层 + 组织展示字段」，判分/调度/幂等全部在
 *   `lib/services/recall*.ts`，两处各写一遍必然漂移；
 * - 失败一律抛可读 Error（safe-action 经 `handleServerError` 转成 `serverError`），
 *   不返回 `{ ok: false }`：静默失败会让页面停在"什么都没发生"的样子。
 */
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { authenticatedAction } from "@/lib/safe-action";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import {
  archiveCard,
  getCard,
  getTodayQueue,
  submitReview,
  unarchiveCard,
  RecallServiceError,
} from "@/lib/services/recall";
import {
  deleteCard,
  importDeck,
  listDecks,
  upsertCard,
} from "@/lib/services/recall-import";
import { getStudyDay, getStudyDayStart } from "@/lib/recall/study-day";
import type { RecallImportConflictStrategy } from "@/lib/recall/types";

const { recall_review_logs } = drizzleSchema;

/** streakDays 的回溯上限（规格 §4.1：最多查 365 天，避免一次拉全部历史） */
const RECALL_STREAK_MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 学习日 `YYYY-MM-DD` 加减天数（纯日期算术，不经过本地时区） */
function shiftStudyDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 连续学习天数（学习日 = Asia/Shanghai 04:00 切换）。
 *
 * 口径：今天有日志就从今天算；今天还没有就从**昨天**算（否则每天早上打开应用
 * 都会看到"连续 0 天"，把昨天刚攒的连续记录清空）。跨度以今天为终点最多 365 天。
 *
 * 学习日归属用共享的 `getStudyDay()` 在 JS 里算，而不是在 SQL 里写
 * `date(ts, '+4 hours')`：时区偏移只允许有一个事实来源，SQL 里的魔法偏移
 * 一旦与 `study-day.ts` 不同步，连续天数会在凌晨 4 点前后悄悄错一天。
 */
async function computeStreakDays(userId: number, now: Date): Promise<number> {
  const today = getStudyDay(now);
  const oldest = shiftStudyDay(today, -(RECALL_STREAK_MAX_DAYS - 1));

  const rows = await drizzleDb
    .select({ ts: recall_review_logs.ts })
    .from(recall_review_logs)
    .where(
      and(
        eq(recall_review_logs.user_id, userId),
        gte(recall_review_logs.ts, getStudyDayStart(oldest).toISOString()),
      ),
    );

  const studied = new Set<string>();
  for (const row of rows) {
    const at = new Date(row.ts);
    // 脏时间戳（手改库/旧格式）不参与统计，但不能让整个页面挂掉
    if (Number.isNaN(at.getTime())) continue;
    studied.add(getStudyDay(at));
  }

  let cursor = studied.has(today) ? today : shiftStudyDay(today, -1);
  let streak = 0;
  while (streak < RECALL_STREAK_MAX_DAYS && studied.has(cursor)) {
    streak += 1;
    cursor = shiftStudyDay(cursor, -1);
  }
  return streak;
}

/**
 * 下次复习提示（规格 §4.3）。
 *
 * - 全对：`下次 11 月 20 日`（按**学习日**取月日，不是 UTC 日期）；
 * - 有错：`明天只重测这 3 条`（条数取新的 pendingItems）。
 */
function buildNextReviewText(
  nextDue: string,
  pendingItems: number[] | null,
): string {
  if (pendingItems && pendingItems.length > 0) {
    return `明天只重测这 ${pendingItems.length} 条`;
  }

  const due = new Date(nextDue);
  if (Number.isNaN(due.getTime())) {
    throw new RecallServiceError(`调度返回的 nextDue 非法：${nextDue}`);
  }
  const [, month, date] = getStudyDay(due).split("-").map(Number);
  return `下次 ${month} 月 ${date} 日`;
}

const CardIdSchema = z.object({
  cardId: z.number().int().positive("cardId 必须是正整数"),
});

/** 今日队列概要（首页/回忆页顶部那行「今天 4 张 · 约 2 分钟 · 连续 3 天」） */
export const getRecallQueueAction = authenticatedAction.action(
  async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();
    const queue = await getTodayQueue(userId, { now });
    const streakDays = await computeStreakDays(userId, now);

    return {
      total: queue.total,
      // `due` / `fresh` 保留**计数**（旧调用方按数字消费），编号一律走 `ids`
      due: queue.due.length,
      fresh: queue.fresh.length,
      // 顺序 = 到期优先（due 升序），再新卡（id 升序）：客户端据此逐张取卡
      ids: [...queue.due, ...queue.fresh],
      estimatedMinutes: queue.estimatedMinutes,
      streakDays,
    };
  },
);

/** 取一张卡的内容 + 该用户的重测条目（`mode="retest"` 时 UI 只呈现 pendingItems） */
export const getRecallCardAction = authenticatedAction
  .inputSchema(CardIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const card = await getCard(ctx.user.id, parsedInput.cardId);
    const pendingItems = card.state?.pendingItems ?? null;

    return {
      cardId: card.cardId,
      deckTitle: card.deckTitle,
      kind: card.kind,
      prompt: card.prompt,
      items:
        card.kind === "list"
          ? // 带上 keywords：客户端提交前的预判要和服务端判分逐字一致，
            // 少了它只能拿整条文本当关键词，会"预览判黄、提交判绿"
            (card.items ?? []).map((item) => ({
              text: item.text,
              keywords: [...item.keywords],
            }))
          : null,
      blanks:
        card.kind === "cloze"
          ? (card.blanks ?? []).map((blank) => ({
              answers: [...blank.answers],
            }))
          : null,
      pendingItems,
      mode: pendingItems && pendingItems.length > 0 ? "retest" : "first",
    };
  });

const SubmitRecallReviewSchema = z.object({
  cardId: z.number().int().positive("cardId 必须是正整数"),
  typed: z.string(),
  allBlank: z.boolean().optional(),
  /**
   * 客户端幂等键（进入判分屏时生成的 UUID）。跨秒重试必须沿用同一个 key，
   * 否则会重复写日志、重复推进调度。
   */
  clientKey: z.string().trim().min(1).max(120).optional(),
  overrides: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        to: z.enum(["ok", "miss"]),
      }),
    )
    .optional(),
});

/** 提交一次作答：判分 + 调度 + 落日志，返回可直接渲染的结论 */
export const submitRecallReviewAction = authenticatedAction
  .inputSchema(SubmitRecallReviewSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await submitReview(ctx.user.id, parsedInput.cardId, {
      typed: parsedInput.typed,
      allBlank: parsedInput.allBlank,
      overrides: parsedInput.overrides,
      clientKey: parsedInput.clientKey,
    });

    return {
      verdicts: result.verdicts,
      rating: result.rating,
      nextDue: result.nextDue,
      pendingItems: result.pendingItems,
      nextReviewText: buildNextReviewText(result.nextDue, result.pendingItems),
    };
  });

const ArchiveRecallCardSchema = z.object({
  cardId: z.number().int().positive("cardId 必须是正整数"),
  archived: z.boolean(),
});

/** 归档 / 取消归档（移出队列但保留历史；取消归档时新卡会重新进入新卡池） */
export const archiveRecallCardAction = authenticatedAction
  .inputSchema(ArchiveRecallCardSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.archived) {
      await archiveCard(ctx.user.id, parsedInput.cardId);
    } else {
      // 没有状态行 = 本来就没归档过，取消归档是幂等空操作（不必报错）
      await unarchiveCard(ctx.user.id, parsedInput.cardId);
    }
    return { archived: parsedInput.archived };
  });

const ImportRecallDeckSchema = z.object({
  json: z.string().min(1, "内容不能为空"),
  onConflict: z.enum(["keep", "accept"]).optional(),
});

/** 导入卡组文件（幂等；内容冲突默认保留库内内容） */
export const importRecallDeckAction = authenticatedAction
  .inputSchema(ImportRecallDeckSchema)
  .action(async ({ parsedInput, ctx }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(parsedInput.json);
    } catch (error) {
      // 转换重抛：把 JSON.parse 的英文报错包成用户能照做的提示
      throw new RecallServiceError(
        `卡组文件不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const onConflict: RecallImportConflictStrategy =
      parsedInput.onConflict ?? "keep";
    const result = await importDeck(ctx.user.id, parsed, { onConflict });

    return {
      deckKey: result.deckKey,
      createdCards: result.createdCards,
      updatedCards: result.updatedCards,
      skippedCards: result.skippedCards,
      conflicts: result.conflicts.map((conflict) => ({
        cardId: conflict.cardId,
        action: conflict.action,
      })),
      missingInFile: result.missingInFile,
    };
  });

/** 卡组列表（含该用户已归档数量；卡组选择页用） */
export const listRecallDecksAction = authenticatedAction.action(
  async ({ ctx }) => {
    const decks = await listDecks(ctx.user.id);
    return decks.map((deck) => ({
      deckKey: deck.deckKey,
      title: deck.title,
      cardCount: deck.cardCount,
      archivedCount: deck.archivedCount,
    }));
  },
);

const SaveRecallCardSchema = z.object({
  deckKey: z.string().trim().min(1, "deckKey 不能为空").max(120),
  cardId: z.string().trim().min(1, "cardId 不能为空").max(120),
  prompt: z.string().trim().min(1, "题干不能为空"),
  kind: z.enum(["list", "cloze"]),
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1, "条目文本不能为空"),
        keywords: z.array(z.string().trim().min(1)).min(1).max(20),
      }),
    )
    .min(1)
    .max(6)
    .optional(),
  blanks: z
    .array(
      z.object({
        answers: z.array(z.string().trim().min(1)).min(1).max(3),
      }),
    )
    .min(1)
    .optional(),
  /**
   * 逐字判分开关。编辑器不暴露它，因此**不传**表示"沿用库里的旧值"；
   * 只有显式传 false 才会关掉它（下表里 `undefined` 与 `false` 必须能区分）。
   */
  verbatim: z.boolean().optional(),
});

/** 新增 / 修改单卡（内容全局共享，不改任何人的复习进度） */
export const saveRecallCardAction = authenticatedAction
  .inputSchema(SaveRecallCardSchema)
  .action(async ({ parsedInput, ctx }) => {
    await upsertCard(ctx.user.id, {
      deckKey: parsedInput.deckKey,
      cardId: parsedInput.cardId,
      prompt: parsedInput.prompt,
      kind: parsedInput.kind,
      items: parsedInput.items,
      blanks: parsedInput.blanks,
      verbatim: parsedInput.verbatim,
    });
    return { ok: true as const };
  });

const DeleteRecallCardSchema = z.object({
  deckKey: z.string().trim().min(1, "deckKey 不能为空").max(120),
  cardId: z.string().trim().min(1, "cardId 不能为空").max(120),
});

/** 删除单卡（先确认卡属于该 deck，否则会跨卡组误删全局内容） */
export const deleteRecallCardAction = authenticatedAction
  .inputSchema(DeleteRecallCardSchema)
  .action(async ({ parsedInput, ctx }) => {
    await deleteCard(ctx.user.id, parsedInput.deckKey, parsedInput.cardId);
    return { ok: true as const };
  });
