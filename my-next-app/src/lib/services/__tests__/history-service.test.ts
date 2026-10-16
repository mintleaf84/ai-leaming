// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { historyService } from "../history";

// 创建一个支持链式调用的 Proxy Mock
const createChainMock = (finalValue: any) => {
  const chain: any = new Proxy(() => {}, {
    get: (_, prop) => {
      if (prop === "then") return (resolve: any) => resolve(finalValue);
      if (prop === "all") return vi.fn().mockResolvedValue(finalValue);
      if (prop === "get") return vi.fn().mockResolvedValue(finalValue);
      return chain;
    },
    apply: () => chain,
  });
  return chain;
};

// Mock dependencies
const { mockGet, mockAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockAll: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const drizzleMock: any = {
    select: vi.fn(() => {
      const chain: any = new Proxy(() => {}, {
        get: (_, prop) => {
          if (prop === "all")
            return vi.fn().mockImplementation(() => Promise.resolve(mockAll()));
          if (prop === "get")
            return vi.fn().mockImplementation(() => Promise.resolve(mockGet()));
          if (prop === "then")
            return (resolve: any) => resolve(mockAll() || []);
          return chain;
        },
        apply: () => chain,
      });
      return chain;
    }),
    query: {
      practice_sessions: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockGet())),
      },
    },
    insert: vi.fn(() => createChainMock({ changes: 1 })),
    update: vi.fn(() => createChainMock({ changes: 1 })),
    delete: vi.fn(() => createChainMock({ changes: 1 })),
    transaction: vi.fn((cb) => cb(drizzleMock)),
  };

  return {
    default: drizzleMock,
    db: drizzleMock,
    drizzleDb: drizzleMock,
    drizzleSchema: new Proxy({}, { get: (_, prop) => prop }),
  };
});

describe("History Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getHistory", () => {
    it("should return paginated history", async () => {
      const mockCount = { value: 20 };
      const mockItems = [
        {
          id: "s1",
          totalQuestions: 10,
          correctCount: 8,
          createdAt: "2023-01-01T00:00:00Z",
          reviewCount: 0,
        },
      ];

      mockGet.mockReturnValue(mockCount);
      mockAll.mockReturnValue(mockItems);

      const result = await historyService.getHistory(1, {
        page: 1,
        pageSize: 10,
      });

      expect(result.total).toBe(20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].accuracy).toBe(80);
      expect(result.totalPages).toBe(2);
    });

    it("should apply filters", async () => {
      const mockCount = { value: 1 };
      const mockItems = [
        {
          id: "s1",
          totalQuestions: 10,
          correctCount: 10,
          createdAt: "2023-01-01T00:00:00Z",
          reviewCount: 0,
        },
      ]; // 100% acc

      mockGet.mockReturnValue(mockCount);
      mockAll.mockReturnValue(mockItems);

      const result = await historyService.getHistory(1, {
        dateFrom: "2023-01-01",
        accuracyMin: 90,
      });
    });

    it("should filter out items by accuracy (SQL verify)", async () => {
      const mockCount = { value: 0 };
      const mockItems: unknown[] = []; // Filtered out by DB

      mockGet.mockReturnValue(mockCount);
      mockAll.mockReturnValue(mockItems);

      const result = await historyService.getHistory(1, { accuracyMin: 80 });

      expect(result.items).toHaveLength(0); // Filtered out
    });
  });

  describe("getSessionDetail", () => {
    it("should return session and logs", async () => {
      const mockSession = {
        id: "s1",
        totalQuestions: 10,
        correctCount: 8,
        createdAt: "2023-01-01T00:00:00Z",
        reviewCount: 0,
      };
      const mockLogs = [
        {
          questionId: 1,
          options: '["A"]',
          tags: '["tag1"]',
          isCorrect: 1,
        },
      ];

      mockGet.mockReturnValue(mockSession);
      mockAll.mockReturnValue(mockLogs);

      const result = await historyService.getSessionDetail(1, "s1");

      expect(result).not.toBeNull();
      expect(result?.session.id).toBe("s1");
      expect(result?.logs).toHaveLength(1);
      expect(result?.logs[0].options).toEqual(["A"]);
      expect(result?.logs[0].isCorrect).toBe(true);
    });

    it("should return null if not found", async () => {
      mockGet.mockReturnValue(null);

      const result = await historyService.getSessionDetail(1, "s1");

      expect(result).toBeNull();
    });
  });
});
