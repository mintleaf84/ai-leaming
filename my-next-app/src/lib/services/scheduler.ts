import cron, { ScheduledTask } from "node-cron";
import { lt, sql } from "drizzle-orm";
import { BackupService } from "./backup-service";
import { log } from "@/lib/logger";
import { drizzleDb, drizzleSchema } from "@/lib/db";

let backupTask: ScheduledTask | null = null;
let purgeTask: ScheduledTask | null = null;
let retentionTask: ScheduledTask | null = null;

/**
 * 日志表保留策略（O1）。
 *
 * 只清「纯日志」表；`practice_logs` 是学习记录（错题归因、统计都靠它），
 * **永不清理**——真出问题也该走导出，不是自动删。新增日志表时在这里加一行即可。
 *
 * 天数按业务价值定：调用明细（api_call_logs）只在"最近出了什么问题"里有用，
 * 留 90 天；审计类（admin_logs / api_audit_logs）要能追溯半年，留 180 天；
 * web_vitals 是性能采样的原始点，聚合看趋势就够，90 天。
 */
export const LOG_RETENTION: ReadonlyArray<{
  table: string;
  days: number;
  label: string;
}> = [
  { table: "admin_logs", days: 180, label: "管理操作日志" },
  { table: "api_call_logs", days: 90, label: "API 调用明细" },
  { table: "api_audit_logs", days: 180, label: "写操作审计" },
  { table: "web_vitals", days: 90, label: "前端性能采样" },
];

/**
 * 计算 created_at 的截止时间戳。
 *
 * `created_at` 由 `CURRENT_TIMESTAMP` 写入，格式是 `YYYY-MM-DD HH:MM:SS`（UTC）。
 * 必须用**同样的字符串格式**比较，才能命中 created_at 上的索引
 * （TEXT 列按字典序比较，同格式下等价于按时间比较）；用 ISO 的 `T` 分隔符
 * 会让比较退化成全表扫描，且 'T' > ' ' 导致边界那天被误删。
 */
export function retentionCutoff(days: number, now: number = Date.now()): string {
  return new Date(now - days * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export interface LogRetentionResult {
  table: string;
  label: string;
  days: number;
  /** 命中截止时间的行数（dry-run 与实删前都先数一遍） */
  matched: number;
  /** 实际删除行数；dry-run 下恒为 0 */
  deleted: number;
}

export interface LogRetentionOptions {
  /** true 时只统计不删除。也认环境变量 PURGE_DRY_RUN=1（运维临时验证用） */
  dryRun?: boolean;
  /** 注入当前时间，便于测试构造过期数据 */
  now?: number;
}

/**
 * 执行一次日志保留清理。可单独调用（`PURGE_DRY_RUN=1` 做演练），
 * 也被每日 04:10 的 cron 任务调用（与 03:00 的备份错开，避免和
 * `VACUUM INTO` 抢写锁）。
 *
 * 单表失败不阻塞其它表：日志清理是尽力而为的后台维护，一张表锁住
 * 不该让另外三张表继续膨胀。
 */
export async function runLogRetention(
  options: LogRetentionOptions = {},
): Promise<LogRetentionResult[]> {
  const dryRun = options.dryRun ?? process.env.PURGE_DRY_RUN === "1";
  const now = options.now ?? Date.now();
  const results: LogRetentionResult[] = [];

  for (const rule of LOG_RETENTION) {
    const cutoff = retentionCutoff(rule.days, now);
    try {
      const counted = await drizzleDb.get<{ count: number }>(sql`
        SELECT COUNT(*) AS count
        FROM ${sql.identifier(rule.table)}
        WHERE created_at < ${cutoff}
      `);
      const matched = counted?.count ?? 0;

      if (dryRun) {
        log.info(
          `🧹 [Scheduler][dry-run] ${rule.table}（${rule.label}，>${rule.days}d）将删除 ${matched} 行`,
        );
        results.push({
          table: rule.table,
          label: rule.label,
          days: rule.days,
          matched,
          deleted: 0,
        });
        continue;
      }

      if (matched === 0) {
        results.push({
          table: rule.table,
          label: rule.label,
          days: rule.days,
          matched: 0,
          deleted: 0,
        });
        continue;
      }

      const deleted = await drizzleDb.run(sql`
        DELETE FROM ${sql.identifier(rule.table)}
        WHERE created_at < ${cutoff}
      `);
      const deletedRows = deleted.rowsAffected ?? matched;
      log.info(
        `🧹 [Scheduler] 清理 ${rule.table}（${rule.label}）${deletedRows} 行（>${rule.days}d）`,
      );
      results.push({
        table: rule.table,
        label: rule.label,
        days: rule.days,
        matched,
        deleted: deletedRows,
      });
    } catch (error) {
      // audit-allow: 显式降级——单表清理失败只记结构化日志、继续下一张表，
      // 等下一个 cron 周期再试（cron 回调没有调用方，不需要向上抛）
      log.error(
        { err: error, table: rule.table, cutoff },
        `❌ [Scheduler] 清理 ${rule.table} 失败，等下一周期重试`,
      );
      continue;
    }
  }

  return results;
}

/**
 * 初始化后台调度任务
 */
export async function initScheduler() {
  log.info("⏰ [Scheduler] 正在初始化后台任务...");

  // 1. 数据库备份任务 (每天凌晨 3:00 执行)
  // 语法: 分 时 日 月 周
  if (backupTask) {
    backupTask.stop();
  }

  backupTask = cron.schedule("0 3 * * *", async () => {
    try {
      const config = await BackupService.getConfig();

      if (!config.enabled) {
        log.info("📦 [Scheduler] 自动备份已禁用，跳过本次任务");
        return;
      }

      log.info("📦 [Scheduler] 开始执行每日自动备份...");
      const fileName = await BackupService.performBackup();
      log.info(`✅ [Scheduler] 自动备份成功: ${fileName}`);
    } catch (error) {
      log.error("❌ [Scheduler] 自动备份执行失败:", error);
      // 显式降级：本次任务终止，等下一个 cron 周期
      return;
    }
  });

  // 2. 过期导入任务清理（每小时）
  // 写入/读取路径只在"有人活动"时回收，长期无人导入时过期的 OCR 原文会一直留着；
  // 这条是独立于业务路径的兜底（多实例下每实例都跑也没关系：DELETE 是幂等的）
  if (purgeTask) {
    purgeTask.stop();
  }
  purgeTask = cron.schedule("17 * * * *", async () => {
    try {
      const deleted = await drizzleDb
        .delete(drizzleSchema.pdf_import_tasks)
        .where(lt(drizzleSchema.pdf_import_tasks.expires_at, Date.now()))
        .returning({ id: drizzleSchema.pdf_import_tasks.id });
      if (deleted.length > 0) {
        log.info(`🧹 [Scheduler] 清理过期导入任务 ${deleted.length} 条`);
      }
    } catch (error) {
      // audit-allow: 显式降级——本次清理终止、等下一个 cron 周期，
      // 失败已记结构化日志，不需要向上抛（cron 回调没有调用方）
      log.error("❌ [Scheduler] 清理过期导入任务失败:", error);
    }
  });

  // 3. 日志表保留清理（每天 04:10）
  // 与 03:00 的备份错开一小时：备份走 `VACUUM INTO`，与大批量 DELETE 撞在
  // 同一时刻会互相等写锁。多实例部署下 DELETE 幂等，重复跑也只是空转。
  if (retentionTask) {
    retentionTask.stop();
  }
  retentionTask = cron.schedule("10 4 * * *", async () => {
    try {
      log.info("🧹 [Scheduler] 开始执行日志保留清理...");
      await runLogRetention();
    } catch (error) {
      // audit-allow: 显式降级——本次清理终止、等下一个 cron 周期，
      // 失败已记结构化日志，不需要向上抛（cron 回调没有调用方）
      log.error("❌ [Scheduler] 日志保留清理失败:", error);
    }
  });

  log.info(
    "✅ [Scheduler] 任务调度器已就绪 (每日 03:00 备份 · 每小时清理过期导入任务 · 每日 04:10 日志保留清理)",
  );
}
