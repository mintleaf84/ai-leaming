import cron, { ScheduledTask } from "node-cron";
import { lt } from "drizzle-orm";
import { BackupService } from "./backup-service";
import { log } from "@/lib/logger";
import { drizzleDb, drizzleSchema } from "@/lib/db";

let backupTask: ScheduledTask | null = null;
let purgeTask: ScheduledTask | null = null;

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

  log.info(
    "✅ [Scheduler] 任务调度器已就绪 (每日 03:00 备份 · 每小时清理过期导入任务)",
  );
}
