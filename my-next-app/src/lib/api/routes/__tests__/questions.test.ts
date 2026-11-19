// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../questions";

// Mock dependencies
const { mockQuestionService } = vi.hoisted(() => {
  return {
    mockQuestionService: {
      getById: vi.fn(),
      list: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/question", () => ({
  questionService: mockQuestionService,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    await next();
  },
}));

describe("Questions Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return questions list", async () => {
      mockQuestionService.list.mockResolvedValue({
        items: [{ id: 1, content: "Q", options: [], tags: [] }],
        total: 1,
      });
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
    });
  });

  describe("GET /:id", () => {
    it("should return a question", async () => {
      mockQuestionService.getById.mockResolvedValue({
        id: 1,
        content: "Q",
        options: [],
        tags: [],
        type: "single",
      });
      const res = await app.request("/1");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(1);
    });
  });

  describe("GET / — limit 上限", () => {
    it("limit=100000 被夹到 100，offset 按夹后的 limit 计算", async () => {
      mockQuestionService.list.mockResolvedValue({ items: [], total: 0 });

      const res = await app.request("/?page=2&limit=100000");
      expect(res.status).toBe(200);

      expect(mockQuestionService.list).toHaveBeenCalledWith({
        offset: 100, // (2-1) * 100，而不是 (2-1) * 100000
        limit: 100,
        search: undefined,
        type: undefined,
      });
    });
  });
});
