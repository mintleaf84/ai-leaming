// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import cron from "node-cron";
import {
  initScheduler,
  runLogRetention,
  retentionCutoff,
  LOG_RETENTION,
} from "../scheduler";
import { BackupService } from "../backup-service";

// Mock node-cron
const { mockLog } = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 日志保留清理只依赖 drizzleDb 的 get/run 两个原子方法，mock 掉即可，
// 不需要为它拉一整套真实 SQLite。
const { mockGet, mockRun } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRun: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  drizzleDb: {
    get: mockGet,
    run: mockRun,
    delete: vi.fn(),
  },
  drizzleSchema: {
    pdf_import_tasks: { expires_at: "expires_at", id: "id" },
  },
}));

vi.mock("@/lib/logger", () => ({
  log: mockLog,
  logger: mockLog,
  default: mockLog,
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
  ScheduledTask: class {},
}));

// Mock BackupService
vi.mock("../backup-service", () => ({
  BackupService: {
    getConfig: vi.fn(),
    performBackup: vi.fn(),
  },
}));

describe("Scheduler Service", () => {
  let mockCronSchedule: ReturnType<typeof vi.fn>;
  let mockTaskStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskStop = vi.fn();
    mockCronSchedule = cron.schedule as ReturnType<typeof vi.fn>;
    mockCronSchedule.mockReturnValue({ stop: mockTaskStop });
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("initScheduler", () => {
    it("应成功初始化调度器并注册每日备份任务", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "https://example.com/webdav",
        user: "admin",
        pass: "password",
        remotePath: "/backups",
        retentionDays: 30,
      });

      await initScheduler();

      // 验证 cron.schedule 被调用，参数为每天凌晨3点
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 3 * * *",
        expect.any(Function),
      );
    });

    it("应在备份已禁用时跳过执行", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: false,
        url: "",
        user: "",
        pass: "",
        remotePath: "/backups",
        retentionDays: 30,
      });

      mockLog.info.mockClear();
      mockLog.error.mockClear();

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证 performBackup 没有被调用
      expect(BackupService.performBackup).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("自动备份已禁用"),
      );
    });

    it("应在备份执行成功时记录日志", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "https://example.com/webdav",
        user: "admin",
        pass: "password",
        remotePath: "/backups",
        retentionDays: 30,
      });
      (
        BackupService.performBackup as ReturnType<typeof vi.fn>
      ).mockResolvedValue("ai-learning.db.2025-01-01-03-00-00.gz");

      mockLog.info.mockClear();
      mockLog.error.mockClear();

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证 performBackup 被调用
      expect(BackupService.performBackup).toHaveBeenCalled();
      // 验证成功日志
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("开始执行每日自动备份"),
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("自动备份成功"),
      );
    });

    it("应在备份执行失败时捕获异常", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "https://example.com/webdav",
        user: "admin",
        pass: "password",
        remotePath: "/backups",
        retentionDays: 30,
      });
      (
        BackupService.performBackup as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Network error"));

      mockLog.info.mockClear();
      mockLog.error.mockClear();

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证错误日志被记录
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining("自动备份执行失败"),
        expect.any(Error),
      );
    });

    it("应在已有任务时先停止旧任务再创建新任务", async () => {
      // 第一次初始化
      await initScheduler();
      const firstTask = mockCronSchedule.mock.results[0].value;

      // 第二次初始化
      await initScheduler();

      // 验证旧任务被停止
      expect(firstTask.stop).toHaveBeenCalled();
      // 验证新任务被创建：备份 + 过期导入任务清理 + 日志保留清理各一条
      // 两次初始化 × 3 个任务 = 6 次
      expect(mockCronSchedule).toHaveBeenCalledTimes(6);
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "17 * * * *",
        expect.any(Function),
      );
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "10 4 * * *",
        expect.any(Function),
      );
    });

    it("应打印初始化完成的日志", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "",
        user: "",
        pass: "",
        remotePath: "",
        retentionDays: 30,
      });

      mockLog.info.mockClear();
      mockLog.error.mockClear();

      await initScheduler();

      // 验证初始化日志
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("[Scheduler] 正在初始化后台任务"),
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("任务调度器已就绪"),
      );
    });
  });

  describe("Cron 表达式验证", () => {
    it("应使用正确的 cron 表达式 (每天凌晨 3:00)", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "",
        user: "",
        pass: "",
        remotePath: "",
        retentionDays: 30,
      });

      await initScheduler();

      // 验证 cron 表达式：分 时 日 月 周
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 3 * * *", // 每天凌晨 3:00
        expect.any(Function),
      );
    });

    it("日志保留清理应每天 04:10 执行（与 03:00 备份错开）", async () => {
      (BackupService.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: true,
        url: "",
        user: "",
        pass: "",
        remotePath: "",
        retentionDays: 30,
      });

      await initScheduler();

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "10 4 * * *", // 每天凌晨 4:10
        expect.any(Function),
      );
    });
  });

  describe("日志保留清理 (runLogRetention)", () => {
    beforeEach(() => {
      mockGet.mockReset();
      mockRun.mockReset();
      mockLog.info.mockClear();
      mockLog.error.mockClear();
      delete process.env.PURGE_DRY_RUN;
    });

    it("保留策略覆盖四张日志表且不含 practice_logs", () => {
      expect(LOG_RETENTION.map((r) => r.table)).toEqual([
        "admin_logs",
        "api_call_logs",
        "api_audit_logs",
        "web_vitals",
      ]);
      expect(LOG_RETENTION.some((r) => r.table === "practice_logs")).toBe(
        false,
      );
    });

    it("截止时间用 CURRENT_TIMESTAMP 的格式，保证能走 created_at 索引", () => {
      const cutoff = retentionCutoff(90, Date.UTC(2026, 0, 1, 12, 0, 0));
      expect(cutoff).toBe("2025-10-03 12:00:00");
      expect(cutoff).not.toContain("T");
    });

    it("dry-run 只统计不删除", async () => {
      mockGet.mockResolvedValue({ count: 7 });

      const results = await runLogRetention({ dryRun: true });

      expect(mockRun).not.toHaveBeenCalled();
      expect(results).toHaveLength(LOG_RETENTION.length);
      expect(results.every((r) => r.matched === 7 && r.deleted === 0)).toBe(
        true,
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]"),
      );
    });

    it("PURGE_DRY_RUN=1 等价于 --dry-run", async () => {
      process.env.PURGE_DRY_RUN = "1";
      mockGet.mockResolvedValue({ count: 2 });

      const results = await runLogRetention();

      expect(mockRun).not.toHaveBeenCalled();
      expect(results[0].deleted).toBe(0);
    });

    it("命中行数为 0 时不发 DELETE", async () => {
      mockGet.mockResolvedValue({ count: 0 });

      const results = await runLogRetention({ dryRun: false });

      expect(mockRun).not.toHaveBeenCalled();
      expect(results.every((r) => r.matched === 0 && r.deleted === 0)).toBe(
        true,
      );
    });

    it("实删按表统计删除行数", async () => {
      mockGet.mockResolvedValue({ count: 3 });
      mockRun.mockResolvedValue({ rowsAffected: 3 });

      const results = await runLogRetention({ dryRun: false });

      expect(mockRun).toHaveBeenCalledTimes(LOG_RETENTION.length);
      expect(results.every((r) => r.matched === 3 && r.deleted === 3)).toBe(
        true,
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("清理 admin_logs"),
      );
    });

    it("单表失败只记日志并继续下一张表", async () => {
      mockGet
        .mockRejectedValueOnce(new Error("database is locked"))
        .mockResolvedValue({ count: 1 });
      mockRun.mockResolvedValue({ rowsAffected: 1 });

      const results = await runLogRetention({ dryRun: false });

      expect(results).toHaveLength(LOG_RETENTION.length - 1);
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.objectContaining({ table: "admin_logs" }),
        expect.stringContaining("等下一周期重试"),
      );
      // 后续表仍然被清理
      expect(mockRun).toHaveBeenCalledTimes(LOG_RETENTION.length - 1);
    });
  });
});
