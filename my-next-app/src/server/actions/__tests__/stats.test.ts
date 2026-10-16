// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// 1. 设置 Mock
const { actualSchema, mockDb } = await vi.hoisted(async () => {
  const modSchema = await import("@/lib/db/drizzle-schema");
  const modUtils = await import("@/lib/__tests__/db-mock-utils");
  const mock = modUtils.createTableAwareDrizzleMock();
  return {
    actualSchema: modSchema,
    mockDb: mock,
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDb,
  drizzleSchema: actualSchema,
}));

vi.mock("@/lib/auth/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("@/lib/utils/datetime", () => ({
  getBeijingDateString: vi.fn((d) =>
    d ? d.toISOString().split("T")[0] : "2024-01-15",
  ),
  getBeijingYesterdayString: vi.fn().mockReturnValue("2024-01-14"),
  formatBeijingDisplayDate: vi.fn((_d) => "01/15"),
  getBeijingNow: vi.fn().mockReturnValue({
    subtract: vi.fn().mockImplementation((n, unit) => {
      const d = new Date("2024-01-15T10:00:00Z");
      d.setDate(d.getDate() - n);
      return {
        format: vi.fn().mockImplementation((fmt) => {
          if (fmt === "YYYY-MM-DD") return d.toISOString().split("T")[0];
          if (fmt === "M/D") return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
          return "";
        }),
      };
    }),
  }),
}));

import { getUserStatsAction, getPracticeTrendAction } from "../stats";
import { resetDrizzleMock } from "@/lib/__tests__/db-mock-utils";

describe("Stats Actions (Enhanced Mock)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
    resetDrizzleMock(mockDb);
    mockDb.resetTableData?.();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getUserStatsAction", () => {
    it("应该通过 BetterDbMock 正确聚合各项统计数据", async () => {
      // 设置更真实的 Mock 返回逻辑 (按顺序对应 Promise.all 中的查询)
      mockDb.get
        .mockResolvedValueOnce({ count: 500, correct: 400 }) // totalRes
        .mockResolvedValueOnce({ value: 85.6 }) // masteryRes
        .mockResolvedValueOnce({ count: 10, correct: 8 }) // todayRes
        .mockResolvedValueOnce({ id: "session-789" }) // lastSession
        .mockResolvedValueOnce({ value: 3 }) // pendingReviewRes
        .mockResolvedValueOnce({ value: 5 }) // observationRes
        .mockResolvedValueOnce({ value: 100 }); // sessionCountRes

      // weakPoints 是 .all()
      mockDb.all.mockResolvedValueOnce([
        { tag: "React", score: 30 },
        { tag: "TypeScript", score: 45 },
      ]);

      // getStreakDays 中的 .all()
      mockDb.all.mockResolvedValueOnce([
        { date: "2024-01-15" },
        { date: "2024-01-14" },
        { date: "2024-01-13" },
      ]);

      const result = await getUserStatsAction();

      // 验证聚合结果
      expect(result.data?.success).toBe(true);
      expect(result.data?.totalPracticed).toBe(500);
      expect(result.data?.averageMastery).toBe(86); // Math.round(85.6)
      expect(result.data?.streakDays).toBe(3);
      expect(result.data?.todayPracticed).toBe(10);
      expect(result.data?.dailyProgress).toBe(40); // (10 / 25) * 100
      expect(result.data?.lastSessionId).toBe("session-789");

      // 严谨验证：检查是否对正确的表进行了查询
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("getPracticeTrendAction", () => {
    it("应该返回带有填充日期的趋势数据", async () => {
      mockDb.all.mockResolvedValueOnce([
        { date: "2024-01-15", practiced: 20, correct: 18 },
      ]);

      const result = await getPracticeTrendAction(2);

      expect(result.data).toHaveLength(2);
      expect(result.data?.[1].date).toBe("2024-01-15");
      expect(result.data?.[1].practiced).toBe(20);
      expect(result.data?.[1].accuracy).toBe(90); // 18/20

      expect(result.data?.[0].practiced).toBe(0); // 填充日期应为 0
    });
  });
});
