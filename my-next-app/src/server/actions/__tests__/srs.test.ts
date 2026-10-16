// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth - MUST be before imports
const { mockRequireRole } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  requireRole: mockRequireRole,
  requireUser: mockRequireRole,
}));

// Mock srsService
vi.mock("@/lib/services/srs", () => ({
  srsService: {
    getGlobalStats: vi.fn(),
    getOrCreateSrsCard: vi.fn(),
    syncFromPracticeLogs: vi.fn(),
  },
}));

// Mock database
vi.mock("@/lib/db", () => ({
  drizzleDb: {},
  drizzleSchema: {},
}));

// Mock ts-fsrs
vi.mock("ts-fsrs", () => ({
  Rating: { Again: 1, Hard: 2, Good: 3, Easy: 4 },
  fsrs: vi.fn().mockReturnValue({
    repeat: vi.fn().mockReturnValue({
      1: { card: { due: new Date(), scheduled_days: 1 } },
      2: { card: { due: new Date(), scheduled_days: 3 } },
      3: { card: { due: new Date(), scheduled_days: 7 } },
      4: { card: { due: new Date(), scheduled_days: 14 } },
    }),
  }),
  generatorParameters: vi.fn().mockReturnValue({}),
}));

// Import AFTER mocks are set up
import { srsService } from "@/lib/services/srs";
import {
  getSrsGlobalStatsAction,
  getQuestionSrsPredictionsAction,
  getQuestionSrsHistoryAction,
  syncSrsDataAction,
} from "../srs";

describe("SRS Actions", () => {
  const testUser = { id: 1, username: "testuser" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(testUser);
  });

  // Helper to unwrap result - actions may return data directly or wrapped
  const unwrap = (result: any) => {
    if (result && result.data !== undefined && result.data !== null)
      return result.data;
    if (result && Array.isArray(result)) return result;
    return result;
  };

  // ========== getSrsGlobalStatsAction 测试 ==========
  describe("getSrsGlobalStatsAction", () => {
    it("应该返回全局 SRS 统计数据", async () => {
      const mockStats = {
        totalCards: 10,
        stateDistribution: { new: 5, learning: 2, review: 3, relearning: 0 },
        stabilityDistribution: [],
        difficultyDistribution: [],
        futureReviews: [],
        retentionStats: { trueRetention: 80, totalReviews: 50 },
        readingSpeed: { base: 7, multi: 8, truefalse: 6 },
        learnedCount: 20,
      };
      vi.mocked(srsService.getGlobalStats).mockResolvedValue(mockStats);

      const result = await getSrsGlobalStatsAction();
      const data = unwrap(result);

      expect(data.totalCards).toBe(10);
      expect(data.stateDistribution.new).toBe(5);
      expect(data.retentionStats.trueRetention).toBe(80);
      expect(srsService.getGlobalStats).toHaveBeenCalledWith(1);
    });

    it("应该处理空统计数据", async () => {
      const mockStats = {
        totalCards: 0,
        stateDistribution: { new: 0, learning: 0, review: 0, relearning: 0 },
        stabilityDistribution: [],
        difficultyDistribution: [],
        futureReviews: [],
        retentionStats: { trueRetention: 100, totalReviews: 0 },
        readingSpeed: { base: 7, multi: 7, truefalse: 7 },
        learnedCount: 0,
      };
      vi.mocked(srsService.getGlobalStats).mockResolvedValue(mockStats);

      const result = await getSrsGlobalStatsAction();
      const data = unwrap(result);

      expect(data.totalCards).toBe(0);
      expect(data.retentionStats.trueRetention).toBe(100);
    });
  });

  // ========== getQuestionSrsPredictionsAction 测试 ==========
  describe("getQuestionSrsPredictionsAction", () => {
    it("应该返回不同评分下的复习预测", async () => {
      vi.mocked(srsService.getOrCreateSrsCard).mockResolvedValue({
        due: new Date(),
        stability: 10,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 1,
        reps: 0,
        lapses: 0,
        state: 0,
      });

      const result = await getQuestionSrsPredictionsAction(101);
      const data = unwrap(result);

      expect(data).toHaveLength(4);
      expect(data[0].rating).toBe(1);
      expect(data[0].label).toBe("忘记");
      expect(data[1].rating).toBe(2);
      expect(data[1].label).toBe("吃力");
      expect(data[2].rating).toBe(3);
      expect(data[2].label).toBe("良好");
      expect(data[3].rating).toBe(4);
      expect(data[3].label).toBe("简单");
      expect(data[0].interval).toBe(1);
      expect(data[3].interval).toBe(14);
    });
  });

  // ========== getQuestionSrsHistoryAction 测试 ==========
  describe("getQuestionSrsHistoryAction", () => {
    it("应该返回题目的 SRS 历史记录", async () => {
      const mockLogs = [
        { date: "2024-01-01", isCorrect: true, duration: 5000, rating: "Good" },
        {
          date: "2024-01-02",
          isCorrect: false,
          duration: 3000,
          rating: "Again",
        },
        { date: "2024-01-03", isCorrect: true, duration: 4000, rating: "Good" },
      ];

      const { drizzleDb } = await import("@/lib/db");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockLogs),
          }),
        }),
      });
      drizzleDb.select = mockSelect;

      const result = await getQuestionSrsHistoryAction(101);
      const data = unwrap(result);

      expect(data).toHaveLength(3);
      expect(data[0].isCorrect).toBe(true);
      expect(data[1].isCorrect).toBe(false);
      expect(data[0].rating).toBe("Good");
    });

    it("应该处理空历史记录", async () => {
      const { drizzleDb } = await import("@/lib/db");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      drizzleDb.select = mockSelect;

      const result = await getQuestionSrsHistoryAction(999);
      const data = unwrap(result);

      expect(data).toHaveLength(0);
    });
  });

  // ========== syncSrsDataAction 测试 ==========
  describe("syncSrsDataAction", () => {
    it("应该同步历史练习记录到 SRS", async () => {
      vi.mocked(srsService.syncFromPracticeLogs).mockResolvedValue(5);

      const result = await syncSrsDataAction();

      expect(srsService.syncFromPracticeLogs).toHaveBeenCalledWith(1);
    });

    it("应该处理无需同步的情况", async () => {
      vi.mocked(srsService.syncFromPracticeLogs).mockResolvedValue(0);

      const result = await syncSrsDataAction();

      expect(srsService.syncFromPracticeLogs).toHaveBeenCalledWith(1);
    });
  });
});
