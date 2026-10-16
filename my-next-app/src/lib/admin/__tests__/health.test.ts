// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDatabaseStats,
  getSystemInfo,
  getHealthStats,
  formatBytes,
  formatUptime,
} from "../health";
import { createMockQuery } from "@/lib/__tests__/db-mock-utils";

const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const mockDrizzleDb = {
    select: vi.fn(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    all: vi
      .fn()
      .mockResolvedValue([
        { name: "users" },
        { name: "questions" },
        { name: "practice_logs" },
      ]),
    get: vi.fn().mockResolvedValue({ count: 100 }),
  };

  return {
    mockDrizzleDb,
    mockDrizzleSchema: {},
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDrizzleDb,
}));

vi.mock("@/lib/admin/api-stats-service", () => ({
  getApiCallStats: vi.fn().mockResolvedValue({
    today: {
      totalCalls: 10,
      successCalls: 9,
      errorCalls: 1,
      totalTokens: 1000,
      totalCost: 2.0,
    },
    total: {
      totalCalls: 100,
      successCalls: 95,
      errorCalls: 5,
      totalTokens: 10000,
      totalCost: 20.0,
    },
    byModel: [],
    recentErrors: [],
  }),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  statSync: vi.fn().mockReturnValue({ size: 1024 * 1024 }),
}));

describe("Admin Health Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrizzleDb.select.mockReturnValue(createMockQuery([]));
  });

  describe("formatBytes", () => {
    it("应该格式化 0 字节", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("应该格式化字节", () => {
      expect(formatBytes(512)).toBe("512 Bytes");
    });

    it("应该格式化 KB", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("应该格式化 MB", () => {
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
    });

    it("应该格式化 GB", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("应该格式化小数 KB", () => {
      expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("应该格式化非常大的数值", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 5)).toBe("5 GB");
    });
  });

  describe("formatUptime", () => {
    it("应该格式化刚刚启动", () => {
      expect(formatUptime(30)).toBe("刚刚启动");
    });

    it("应该格式化0秒", () => {
      expect(formatUptime(0)).toBe("刚刚启动");
    });

    it("应该格式化1分钟", () => {
      expect(formatUptime(59)).toBe("刚刚启动");
      expect(formatUptime(60)).toBe("1分钟");
    });

    it("应该格式化分钟", () => {
      expect(formatUptime(120)).toBe("2分钟");
    });

    it("应该格式化小时", () => {
      expect(formatUptime(3600)).toBe("1小时");
    });

    it("应该格式化天和小时", () => {
      expect(formatUptime(90000)).toBe("1天1小时");
    });

    it("应该格式化完整时间", () => {
      expect(formatUptime(90060)).toBe("1天1小时1分钟");
    });

    it("应该格式化多天", () => {
      expect(formatUptime(172800)).toBe("2天");
    });
  });

  describe("getSystemInfo", () => {
    it("应该返回系统信息", () => {
      const info = getSystemInfo();

      expect(info).toHaveProperty("nodeVersion");
      expect(info).toHaveProperty("platform");
      expect(info).toHaveProperty("uptime");
      expect(info).toHaveProperty("uptimeFormatted");
      expect(info).toHaveProperty("memoryUsage");
    });

    it("应该包含内存使用信息", () => {
      const info = getSystemInfo();

      expect(info.memoryUsage).toHaveProperty("heapUsed");
      expect(info.memoryUsage).toHaveProperty("heapTotal");
      expect(info.memoryUsage).toHaveProperty("rss");
      expect(info.memoryUsage.formatted).toHaveProperty("heapUsed");
    });
  });

  describe("getDatabaseStats", () => {
    it("应该返回数据库统计信息", async () => {
      const stats = await getDatabaseStats();

      expect(stats).toHaveProperty("sizeBytes");
      expect(stats).toHaveProperty("sizeFormatted");
      expect(stats).toHaveProperty("tables");
      expect(stats).toHaveProperty("totalRows");
    });

    it("应该计算总行数", async () => {
      const stats = await getDatabaseStats();
      expect(typeof stats.totalRows).toBe("number");
    });
  });

  describe("getHealthStats", () => {
    it("应该返回完整健康统计", async () => {
      const stats = await getHealthStats();

      expect(stats).toHaveProperty("database");
      expect(stats).toHaveProperty("system");
      expect(stats).toHaveProperty("apiStats");
      expect(stats).toHaveProperty("timestamp");
    });

    it("应该包含数据库统计", async () => {
      const stats = await getHealthStats();
      expect(stats.database).toHaveProperty("tables");
    });

    it("应该包含系统信息", async () => {
      const stats = await getHealthStats();
      expect(stats.system).toHaveProperty("nodeVersion");
    });

    it("应该包含 API 统计", async () => {
      const stats = await getHealthStats();
      expect(stats.apiStats).toHaveProperty("today");
    });

    it("应该包含时间戳", async () => {
      const stats = await getHealthStats();
      expect(stats.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
