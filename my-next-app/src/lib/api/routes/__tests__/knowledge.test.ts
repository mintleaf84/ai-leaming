// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../knowledge";

// Mock dependencies
const { mockKnowledgeService } = vi.hoisted(() => {
  return {
    mockKnowledgeService: {
      createKnowledgeCard: vi.fn(),
      getAllKnowledgeCards: vi.fn(),
      getCategories: vi.fn(),
      getKnowledgeStats: vi.fn(),
      exportToAnkiTSV: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/knowledge", () => mockKnowledgeService);

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

// Mock AI Client & Prompts at top level
const { mockGenerateTextWrapper, mockGetPromptFromDb } = vi.hoisted(() => ({
  mockGenerateTextWrapper: vi.fn().mockResolvedValue({
    text: '{"title":"Extracted","category":"Test","tags":[],"front":"F","back":"B","key_points":[]}',
  }),
  mockGetPromptFromDb: vi.fn().mockResolvedValue("template"),
}));

vi.mock("@/lib/ai/client", () => ({
  generateTextWrapper: mockGenerateTextWrapper,
}));

vi.mock("@/lib/ai/prompts", () => ({
  getPromptFromDb: mockGetPromptFromDb,
  buildPrompt: vi.fn((t) => t),
  DEFAULT_KNOWLEDGE_EXTRACT_PROMPT: "default",
}));

describe("Knowledge Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /cards", () => {
    it("should return cards list with stats", async () => {
      const mockCards = [{ id: 1, title: "Test Card" }];
      const mockStats = { total: 1, byCategory: [] };
      const mockCats = ["Category A"];

      mockKnowledgeService.getAllKnowledgeCards.mockReturnValue(mockCards);
      mockKnowledgeService.getKnowledgeStats.mockReturnValue(mockStats);
      mockKnowledgeService.getCategories.mockReturnValue(mockCats);

      const res = await app.request("/cards");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.cards).toHaveLength(1);
      expect(data.categories).toContain("Category A");
      expect(data.stats.total).toBe(1);
    });
  });

  describe("POST /extract", () => {
    it("should extract and save card", async () => {
      mockKnowledgeService.createKnowledgeCard.mockResolvedValue(99);

      const res = await app.request("/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "some text", save: true }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(99);
      expect(data.card.title).toBe("Extracted");
    });

    it("should handle AI JSON parsing failure", async () => {
      mockGenerateTextWrapper.mockResolvedValueOnce({ text: "invalid json" });

      const res = await app.request("/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "fail" }),
      });

      expect(res.status).toBe(422);
    });
  });

  describe("POST /cards", () => {
    it("should create a card and return 200", async () => {
      mockKnowledgeService.createKnowledgeCard.mockResolvedValue(42);

      const payload = {
        title: "New Card",
        front: "Q",
        back: "A",
      };

      const res = await app.request("/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(42);
    });
  });

  describe("GET /cards — limit 上限", () => {
    it("limit=100000 被夹到 100（与 external.ts 的 MAX_LIMIT 一致）", async () => {
      mockKnowledgeService.getAllKnowledgeCards.mockReturnValue([]);
      mockKnowledgeService.getKnowledgeStats.mockReturnValue({ total: 0 });
      mockKnowledgeService.getCategories.mockReturnValue([]);

      const res = await app.request("/cards?limit=100000");
      expect(res.status).toBe(200);

      // 第 2 个参数是 limit：不夹的话这里会是 100000，SQL 直接拉全表
      expect(mockKnowledgeService.getAllKnowledgeCards).toHaveBeenCalledWith(
        undefined,
        100,
        undefined,
        1,
      );
    });

    it("非法 limit 回落到默认值而不是 NaN", async () => {
      mockKnowledgeService.getAllKnowledgeCards.mockReturnValue([]);
      mockKnowledgeService.getKnowledgeStats.mockReturnValue({ total: 0 });
      mockKnowledgeService.getCategories.mockReturnValue([]);

      const res = await app.request("/cards?limit=abc");
      expect(res.status).toBe(200);

      const [, limitArg] = mockKnowledgeService.getAllKnowledgeCards.mock
        .calls[0] as [unknown, number];
      expect(Number.isInteger(limitArg)).toBe(true);
      expect(limitArg).toBeGreaterThan(0);
    });
  });
});
