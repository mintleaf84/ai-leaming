// @vitest-environment node
/**
 * 回归：**生产环境缺 `BACKUP_ENCRYPTION_KEY` 时，模块加载不得抛错**。
 *
 * 事故形态（2026-11）：`backup-service` 在模块顶层 `throw`，而 `scheduler.ts` 静态
 * import 它、`instrumentation.ts` 又 `await import("scheduler")` —— 结果整个
 * `initScheduler()` 不执行：每日 3:00 自动备份、每小时的过期导入任务清理全部静默消失，
 * 只有 instrumentation 的一行 "初始化失败" 日志；同时 `/api/admin/system/backup`
 * 的模块加载失败，管理页报的是 HTML 解析错误。
 *
 * 因此这里锁两条：
 *   1. 缺密钥时**能 import**（调度器与页面不被连累）；
 *   2. 真正用到加解密时抛一个**能读懂的业务错误**（`backup.secret.missing`）。
 */
import { describe, it, expect } from "vitest";

const { BackupSecretMissingError, BackupService } = await (async () => {
  // 必须在 import 之前改环境：env 与模块常量都在加载期求值
  // NODE_ENV 在 Next 的类型里是只读的，测试里用索引赋值绕开类型检查
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  delete process.env.BACKUP_ENCRYPTION_KEY;
  delete process.env.NEXT_PHASE;
  delete process.env.SKIP_ENV_VALIDATION;
  process.env.JWT_SECRET ??= "prod-secret-for-test";
  process.env.AI_API_KEY ??= "prod-ai-key-for-test";
  return import("@/lib/services/backup-service");
})();

describe("生产环境缺少 BACKUP_ENCRYPTION_KEY", () => {
  it("模块可以正常加载（不连累 scheduler / 管理页）", () => {
    expect(typeof BackupService.performBackup).toBe("function");
  });

  it("只在真正加解密时抛业务错误，且错误码可诊断", async () => {
    // saveConfig 在写库之前就要加密密码 → 会在 encrypt 处抛
    await expect(
      BackupService.saveConfig({ pass: "p" }),
    ).rejects.toBeInstanceOf(BackupSecretMissingError);

    const error = new BackupSecretMissingError();
    expect(error.code).toBe("backup.secret.missing");
    expect(error.publicMessage).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("调度器模块也能加载（正是事故里被连累的那条链）", async () => {
    await expect(import("@/lib/services/scheduler")).resolves.toBeDefined();
  });
});
