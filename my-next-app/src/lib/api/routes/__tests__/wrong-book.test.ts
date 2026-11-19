// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../wrong-book";

// Mock dependencies
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
    insert: vi.fn(() => createChainMock({ changes: 1 })),
    update: vi.fn(() => createChainMock({ changes: 1 })),
    delete: vi.fn(() => createChainMock({ changes: 1 })),
    all: vi.fn().mockImplementation(() => Promise.resolve(mockAll() || [])),
  };

  return {
    default: drizzleMock,
    db: drizzleMock,
    drizzleDb: drizzleMock,
    drizzleSchema: new Proxy({}, { get: (_, prop) => prop }),
  };
});

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

describe("WrongBook Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /random", () => {
    it("should return random wrong questions with weighted logic", async () => {
      const mockRows = [
        {
          questionId: 101,
          questionContent: "Test Question",
          tags: '["tag1"]',
          wrongCount: 5,
          lastWrongAt: "2024-01-01",
          correctAnswer: "A",
          userLastAnswer: "B",
        },
      ];

      mockAll.mockReturnValue(mockRows);

      const res = await app.request("/random?count=5&mode=priority");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].questionId).toBe("101");
      expect(data[0].wrongCount).toBe(5);
    });

    it("should support tag filtering", async () => {
      mockAll.mockReturnValue([]);

      const res = await app.request("/random?tag=math");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /stats", () => {
    it("should return correct statistics structure", async () => {
      mockGet.mockReturnValue({ count: 10 });
      mockAll.mockReturnValue([{ count: 10 }]); // 为了 .then(r => r[0])

      const res = await app.request("/stats");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        total: 10,
        recent: 10,
        frequent: 1,
      });
    });
  });

  describe("GET /:id", () => {
    it("详情只返回渲染所需字段，不含 material_html / ai_mnemonic", async () => {
      // 查询顺序：题目 → 错题统计 → 历史作答 → 最近一次错答
      mockAll
        .mockReturnValueOnce([
          {
            id: 101,
            content: "题干",
            options: '["A","B"]',
            answer: "A",
            explanation: "解析",
            tags: '["tag1"]',
            type: "single",
          },
        ])
        .mockReturnValueOnce([{ wrongCount: 2, lastWrongAt: "2024-01-01" }])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const res = await app.request("/101");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.questionId).toBe("101");
      expect(data.questionContent).toBe("题干");
      expect(data.wrongCount).toBe(2);
      // 整行查询会把这些大字段一起搬出来；响应里本来就没有它们
      expect(data).not.toHaveProperty("materialHtml");
      expect(data).not.toHaveProperty("aiMnemonic");
    });
  });
});
