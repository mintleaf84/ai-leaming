import { log } from "@/lib/logger";
/**
 * Next.js Instrumentation 钩子
 * 用于执行应用启动时的全局初始化任务（如数据库迁移）
 */
export async function register() {
  // 确保仅在服务端运行
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDatabase } = await import("@/lib/db");
    const { initScheduler } = await import("@/lib/services/scheduler");
    try {
      log.info("🚀 [Instrumentation] 正在初始化应用环境...");
      await initDatabase();
      await initScheduler();
      log.info("✅ [Instrumentation] 全局初始化完成");
    } catch (error) {
      // 启动初始化失败不阻塞进程启动（与历史行为一致），但必须留痕
      log.error("❌ [Instrumentation] 初始化失败:", error);
      return;
    }
  }
}
