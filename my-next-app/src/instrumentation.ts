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

      // 事件循环延迟监控（docs/performance.md T-02）。
      // 本进程同时承担 RSC 渲染、API、node-cron 备份、OCR/PDF 解析与 bcrypt，
      // 任何一个重活卡住都会让所有请求一起变慢 —— 表现为"偶发整页卡死"，
      // 而这种停顿在实验室压测里永远复现不出来，只能靠运行时埋点抓。
      // 只写日志、不改变行为；unref() 保证监控本身不阻止进程退出。
      const { monitorEventLoopDelay } = await import("node:perf_hooks");
      const loopDelay = monitorEventLoopDelay({ resolution: 20 });
      loopDelay.enable();
      setInterval(() => {
        const p99 = loopDelay.percentile(99) / 1e6;
        const max = loopDelay.max / 1e6;
        // 两条判据缺一不可：30s 窗口里一次 300ms 的阻塞会被 p99 平均掉，
        // 只看 p99 会漏掉"偶发整页卡死"这种最伤体验的情况。
        if (p99 > 50 || max > 200) {
          log.warn("[perf] event loop lag", {
            p99_ms: Math.round(p99),
            max_ms: Math.round(max),
            samples: loopDelay.count,
          });
        }
        loopDelay.reset();
      }, 30_000).unref();
    } catch (error) {
      // 启动初始化失败不阻塞进程启动（与历史行为一致），但必须留痕
      log.error("❌ [Instrumentation] 初始化失败:", error);
      return;
    }
  }
}
