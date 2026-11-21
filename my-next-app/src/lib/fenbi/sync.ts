/**
 * 粉笔同步服务（docs/fenbi-sync-design.md §4 / §5 / §6）。
 *
 * ## 三层去重分别落在哪
 *
 * 1. **会话级**：`sourceKey = fenbi:{exercise.key|id}`（与 parser / 油猴脚本同口径）交给
 *    `importService.importFenbiData`，它按 `(user_id, source_key)` 唯一索引
 *    做「先查后写 + 唯一索引兜并发」。这里只负责把键拼对（mapper）。
 * 2. **题目级**：完全交给导入器 —— 已存在的 `externalId` 不重建，只补作答。
 * 3. **同步级**：`fenbi_synced_exercises` 的 `(user_id, exercise_id)`；本文件在
 *    拉详情**之前**先用一次 select 把用户已同步的 id 全查出来（`loadSyncedIds`），
 *    命中即跳过，不浪费粉笔请求。
 *
 * ## 限频不在这里
 *
 * 每分钟一次的限制放在路由层（进程内 Map）。服务层只负责"被调用就老老实实同步"，
 * 定时任务（cron）不该被用户的 60s 窗口挡住。
 *
 * ## 失败处理
 *
 * - 单条记录失败 → 记进 `failed`，继续下一条（不能一条坏数据拖垮整次同步）；
 * - 401/403/430 → 账号置 `expired` 并抛 `BusinessError`，**不自动重试**（§6）。
 */

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { drizzleDb } from "@/lib/db";
import {
  fenbi_accounts,
  fenbi_synced_exercises,
} from "@/lib/db/drizzle-schema";
import { BusinessError, ValidationError } from "@/lib/errors/app-error";
import { importService } from "@/lib/services/import-service";
import { log } from "@/lib/logger";

import {
  FenbiAuthError,
  FenbiRiskControlError,
  getExercise,
  getQuestions,
  listExercises,
  type FenbiExerciseSummary,
} from "./client";
import { decryptSecret, encryptSecret, maskPhone } from "./crypto";
import { parseFenbiExercise } from "./mapper";

/** 分页大小（实测 20 可用） */
const PAGE_SIZE = 20;
/** 翻页上限：防上游 cursor 异常导致死循环（50 页 ≈ 1000 套练习） */
const MAX_PAGES = 50;
/** 单次同步最多处理多少套练习：一次点"同步"不该跑十分钟 */
const MAX_EXERCISES_PER_RUN = 200;
/** 知识点练习的 sheet.type；1=试卷/模考（接口未开放） */
const SYNCABLE_SHEET_TYPE = 3;

export interface FenbiSyncFailure {
  exerciseId: string;
  reason: string;
}

export interface FenbiSyncSummary {
  imported: number;
  skipped: number;
  newQuestions: number;
  failed: FenbiSyncFailure[];
}

export interface FenbiAccountRow {
  id: number;
  user_id: number;
  fenbi_user_id: string | null;
  phone: string | null;
  password_enc: string | null;
  cookie_enc: string | null;
  last_sync_at: string | null;
  last_sync_result: string | null;
  status: "active" | "expired" | "revoked";
}

// ==================== 账号读写 ====================

export async function getFenbiAccount(
  userId: number,
): Promise<FenbiAccountRow | null> {
  const rows = await drizzleDb
    .select()
    .from(fenbi_accounts)
    .where(eq(fenbi_accounts.user_id, userId))
    .limit(1);
  const row = rows[0];
  return row ? (row as unknown as FenbiAccountRow) : null;
}

/**
 * 写入/更新绑定关系。
 *
 * `passwordEnc` 为 null 表示扫码绑定（或服务端没配 FENBI_SECRET）——
 * 这时**保留**已有的 password_enc 不动，避免一次扫码把密码抹掉。
 */
export async function linkFenbiAccount(
  userId: number,
  data: {
    phone: string | null;
    fenbiUserId: string | null;
    cookie: string;
    passwordEnc: string | null;
  },
): Promise<void> {
  const cookieEnc = encryptSecret(data.cookie);
  const now = new Date().toISOString();

  await drizzleDb
    .insert(fenbi_accounts)
    .values({
      user_id: userId,
      fenbi_user_id: data.fenbiUserId,
      phone: data.phone,
      password_enc: data.passwordEnc,
      cookie_enc: cookieEnc,
      linked_at: now,
      status: "active",
    })
    .onConflictDoUpdate({
      target: fenbi_accounts.user_id,
      set: {
        cookie_enc: cookieEnc,
        // 扫码绑定不带手机号/粉笔 id：不要用 null 覆盖已有值
        ...(data.fenbiUserId ? { fenbi_user_id: data.fenbiUserId } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        // 扫码绑定时不覆盖已有密码
        ...(data.passwordEnc ? { password_enc: data.passwordEnc } : {}),
        status: "active",
        updated_at: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/**
 * 解绑：直接删除账号行（连带密码/cookie 一起消失），并清掉同步记录。
 *
 * 已导入的 `practice_sessions` 不动 —— 那是用户的学习数据，解绑不该回溯删除。
 * 清掉 `fenbi_synced_exercises` 的后果只是「重新绑定后可能再扫描一遍历史」，
 * 会话级幂等（source_key）会兜住，不会重复计数。
 */
export async function unlinkFenbiAccount(userId: number): Promise<void> {
  await drizzleDb
    .delete(fenbi_synced_exercises)
    .where(eq(fenbi_synced_exercises.user_id, userId));
  await drizzleDb
    .delete(fenbi_accounts)
    .where(eq(fenbi_accounts.user_id, userId));
}

export interface FenbiStatusView {
  linked: boolean;
  phoneMasked: string | null;
  fenbiUserId: string | null;
  lastSyncAt: string | null;
  lastResult: FenbiSyncSummary | null;
  status: FenbiAccountRow["status"] | null;
}

/**
 * 上次同步摘要的解析。
 *
 * 历史脏数据（手改/截断）降级为 null —— 状态页少一行摘要，比整页 500 好。
 */
function parseLastSyncResult(raw: string | null): FenbiSyncSummary | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FenbiSyncSummary;
  } catch {
    // audit-allow: 摘要解析失败显式降级为 null，不影响绑定状态展示
    return null;
  }
}

export async function getFenbiStatus(userId: number): Promise<FenbiStatusView> {
  const account = await getFenbiAccount(userId);
  if (!account) {
    return {
      linked: false,
      phoneMasked: null,
      fenbiUserId: null,
      lastSyncAt: null,
      lastResult: null,
      status: null,
    };
  }

  const lastResult = parseLastSyncResult(account.last_sync_result);

  return {
    // 只有 active 才算"可用"；expired 仍在 UI 上显示为已绑定（可重新授权）
    linked: account.status === "active",
    phoneMasked: maskPhone(account.phone),
    fenbiUserId: account.fenbi_user_id,
    lastSyncAt: account.last_sync_at,
    lastResult,
    status: account.status,
  };
}

// ==================== 同步 ====================

export interface SyncFenbiOptions {
  /** true = 忽略 last_sync_at，把列表里的记录全扫一遍（已同步的仍会被去重） */
  full?: boolean;
}

async function markExpired(userId: number): Promise<void> {
  await drizzleDb
    .update(fenbi_accounts)
    .set({ status: "expired", updated_at: sql`CURRENT_TIMESTAMP` })
    .where(eq(fenbi_accounts.user_id, userId));
}

/** 取出用户已同步的 exercise_id 集合（第三层去重的一次性预读） */
async function loadSyncedIds(userId: number): Promise<Set<string>> {
  const rows = await drizzleDb
    .select({ exercise_id: fenbi_synced_exercises.exercise_id })
    .from(fenbi_synced_exercises)
    .where(eq(fenbi_synced_exercises.user_id, userId));
  return new Set(rows.map((row) => row.exercise_id));
}

function payloadSha256(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/** 上游 401/403/430 → 账号失效；其它异常原样抛出（由单条 catch 记账） */
function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof FenbiAuthError || error instanceof FenbiRiskControlError
  );
}

/**
 * 把一套练习拉下来、映射、导入、记账。
 * @returns `imported` 或 `skipped`（会话级幂等命中）
 */
async function syncOneExercise(
  userId: number,
  cookie: string,
  summary: FenbiExerciseSummary,
): Promise<{ imported: boolean; newQuestions: number; sessionId: string }> {
  const detail = await getExercise(cookie, summary.id);
  const questionIds =
    detail.sheet.questionIds.length > 0
      ? detail.sheet.questionIds
      : summary.sheet.questionIds;
  const sheetType =
    detail.sheet.type ?? summary.sheet.type ?? SYNCABLE_SHEET_TYPE;

  const payload = await getQuestions(cookie, sheetType, questionIds);
  const parsed = parseFenbiExercise(detail, payload);

  const result = await importService.importFenbiData(userId, parsed);

  if (result.duplicated) {
    return { imported: false, newQuestions: 0, sessionId: result.sessionId };
  }

  // 会话写成功后才记账：先记账后导入会在导入失败时永久跳过这条练习
  await drizzleDb
    .insert(fenbi_synced_exercises)
    .values({
      user_id: userId,
      exercise_id: summary.id,
      source_key: parsed.sourceKey ?? null,
      session_id: result.sessionId,
      payload_sha256: payloadSha256({ detail, payload }),
    })
    .onConflictDoNothing({
      target: [
        fenbi_synced_exercises.user_id,
        fenbi_synced_exercises.exercise_id,
      ],
    });

  return {
    imported: true,
    newQuestions: result.newQuestionsCount,
    sessionId: result.sessionId,
  };
}

/**
 * 同步一个用户的粉笔做题记录。
 *
 * @throws BusinessError 未绑定 / 登录态失效（401/403/430）
 */
export async function syncFenbiForUser(
  userId: number,
  options: SyncFenbiOptions = {},
): Promise<FenbiSyncSummary> {
  const account = await getFenbiAccount(userId);
  if (!account) {
    throw new BusinessError("尚未绑定粉笔账号");
  }
  if (account.status !== "active") {
    throw new BusinessError("粉笔登录态已失效，请重新绑定账号");
  }
  if (!account.cookie_enc) {
    throw new BusinessError("粉笔账号缺少登录态，请重新绑定账号");
  }

  let cookie: string;
  try {
    cookie = decryptSecret(account.cookie_enc);
  } catch {
    // 密钥换了 / 密文损坏：不猜是不是用户问题，直接引导重新绑定
    await markExpired(userId);
    throw new BusinessError("粉笔登录态无法读取，请重新绑定账号");
  }
  if (!cookie) {
    throw new BusinessError("粉笔账号缺少登录态，请重新绑定账号");
  }

  const summary: FenbiSyncSummary = {
    imported: 0,
    skipped: 0,
    newQuestions: 0,
    failed: [],
  };

  const syncedIds = await loadSyncedIds(userId);
  const lastSyncMs = account.last_sync_at
    ? Date.parse(account.last_sync_at)
    : Number.NaN;
  const incremental = !options.full && Number.isFinite(lastSyncMs);

  let cursor = 0;
  let processed = 0;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listing = await listExercises(cookie, {
        cursor,
        count: PAGE_SIZE,
      });

      for (const exercise of listing.exercises) {
        if (processed >= MAX_EXERCISES_PER_RUN) {
          log.warn(
            `[fenbi] 用户 ${userId} 单次同步达到 ${MAX_EXERCISES_PER_RUN} 套上限，剩余留到下次`,
          );
          break;
        }

        if (exercise.sheet.type !== SYNCABLE_SHEET_TYPE) {
          // 列表里实际只有 type=3；真出现 1（试卷/模考）必须如实说明，不假装成功
          summary.failed.push({
            exerciseId: exercise.id,
            reason: "试卷/模考记录接口未开放，暂不支持同步",
          });
          continue;
        }

        if (
          incremental &&
          exercise.createdTime !== null &&
          exercise.createdTime <= lastSyncMs
        ) {
          summary.skipped += 1;
          continue;
        }

        if (syncedIds.has(exercise.id)) {
          summary.skipped += 1;
          continue;
        }

        processed += 1;

        try {
          const outcome = await syncOneExercise(userId, cookie, exercise);
          if (outcome.imported) {
            summary.imported += 1;
            summary.newQuestions += outcome.newQuestions;
            syncedIds.add(exercise.id);
          } else {
            // 会话级幂等命中：补记同步表，下次不必再请求详情
            summary.skipped += 1;
            syncedIds.add(exercise.id);
            await drizzleDb
              .insert(fenbi_synced_exercises)
              .values({
                user_id: userId,
                exercise_id: exercise.id,
                source_key: `fenbi:${exercise.key ?? exercise.id}`,
                session_id: outcome.sessionId,
              })
              .onConflictDoNothing({
                target: [
                  fenbi_synced_exercises.user_id,
                  fenbi_synced_exercises.exercise_id,
                ],
              });
          }
        } catch (error) {
          if (isAuthFailure(error)) throw error;
          summary.failed.push({
            exerciseId: exercise.id,
            reason: error instanceof Error ? error.message : "未知错误",
          });
          log.warn(
            `[fenbi] 用户 ${userId} 同步练习 ${exercise.id} 失败：${(error as Error)?.message ?? "未知错误"}`,
          );
        }
      }

      if (processed >= MAX_EXERCISES_PER_RUN) break;
      if (listing.nextCursor === -1 || listing.exercises.length === 0) break;
      if (listing.nextCursor === cursor) {
        // cursor 不前进 = 上游异常，宁可停下也不死循环
        log.warn(
          `[fenbi] 用户 ${userId} 列表 cursor 未前进（${cursor}），提前结束`,
        );
        break;
      }
      cursor = listing.nextCursor;
    }
  } catch (error) {
    if (isAuthFailure(error)) {
      await markExpired(userId);
      throw new BusinessError("粉笔登录态已失效，请重新绑定账号");
    }
    throw error;
  }

  await drizzleDb
    .update(fenbi_accounts)
    .set({
      last_sync_at: new Date().toISOString(),
      last_sync_result: JSON.stringify(summary),
      updated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(fenbi_accounts.user_id, userId),
        eq(fenbi_accounts.status, "active"),
      ),
    );

  return summary;
}

/**
 * 每日定时同步的入口（设计文档 §6）。
 *
 * 仓库已有 `services/scheduler.ts`（node-cron），但那个文件不归本 lane 修改；
 * 这里把"遍历所有 active 账号、逐个同步、单个失败不影响其他人"封装好，
 * 接线只需要在 scheduler 里加一句 `cron.schedule("30 5 * * *", syncAllFenbiAccounts)`。
 *
 * 账号间刻意留 800ms 间隔：粉笔对机房 IP 的连续请求敏感，几十个用户背靠背
 * 打过去很容易集体 430（§2.1）。
 */
export async function syncAllFenbiAccounts(): Promise<{
  users: number;
  imported: number;
  skipped: number;
  failedUsers: number;
}> {
  const accounts = await drizzleDb
    .select({ user_id: fenbi_accounts.user_id })
    .from(fenbi_accounts)
    .where(eq(fenbi_accounts.status, "active"));

  let imported = 0;
  let skipped = 0;
  let failedUsers = 0;

  for (let i = 0; i < accounts.length; i += 1) {
    const userId = accounts[i].user_id;
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    try {
      const summary = await syncFenbiForUser(userId);
      imported += summary.imported;
      skipped += summary.skipped;
    } catch (error) {
      // audit-allow: 单个用户失败已记日志（含 user_id），继续下一位，不中断整批
      failedUsers += 1;
      // 只记 user_id 与错误分类，不含手机号/cookie
      log.warn(
        `[fenbi] 定时同步用户 ${userId} 失败：${(error as Error)?.message ?? "未知错误"}`,
      );
    }
  }

  return { users: accounts.length, imported, skipped, failedUsers };
}

/**
 * 解析用户提交的手机号（只做格式判断，不做归属地等业务校验）。
 * @throws ValidationError 格式不对（文案里不回显手机号）
 */
export function assertPhoneFormat(phone: string): string {
  const trimmed = phone.trim();
  if (!/^1[3-9]\d{9}$/.test(trimmed)) {
    throw new ValidationError("请输入正确的 11 位手机号");
  }
  return trimmed;
}

/** 仅供测试：常量与判定函数 */
export const __test__ = {
  SYNCABLE_SHEET_TYPE,
  PAGE_SIZE,
  MAX_PAGES,
  isAuthFailure,
};
