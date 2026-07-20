// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import cron from "node-cron";
import { initScheduler } from "../scheduler";
import { BackupService } from "../backup-service";

// Mock node-cron
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

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证 performBackup 没有被调用
      expect(BackupService.performBackup).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("自动备份已禁用"),
      );

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
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

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证 performBackup 被调用
      expect(BackupService.performBackup).toHaveBeenCalled();
      // 验证成功日志
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("开始执行每日自动备份"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("自动备份成功"),
      );

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
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

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await initScheduler();

      // 获取注册的回调函数并执行
      const scheduledCallback = mockCronSchedule.mock.calls[0][1];
      await scheduledCallback();

      // 验证错误日志被记录
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("自动备份执行失败"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("应在已有任务时先停止旧任务再创建新任务", async () => {
      // 第一次初始化
      await initScheduler();
      const firstTask = mockCronSchedule.mock.results[0].value;

      // 第二次初始化
      await initScheduler();

      // 验证旧任务被停止
      expect(firstTask.stop).toHaveBeenCalled();
      // 验证新任务被创建
      expect(mockCronSchedule).toHaveBeenCalledTimes(2);
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

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await initScheduler();

      // 验证初始化日志
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Scheduler] 正在初始化后台任务"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("任务调度器已就绪"),
      );

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
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
  });
});
