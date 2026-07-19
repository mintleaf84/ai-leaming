// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../mastery";

// Mock dependencies
const { mockMasteryService } = vi.hoisted(() => {
  return {
    mockMasteryService: {
      getMasteryTree: vi.fn().mockReturnValue([]),
      getHierarchyMastery: vi.fn().mockReturnValue({ avgScore: 0, count: 0 }),
    },
  };
});

vi.mock("@/lib/services/mastery", () => ({
  masteryService: mockMasteryService,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
  getCurrentUser: () => ({ id: 1 }),
}));

describe("Mastery Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /tree", () => {
    it("should return mastery tree correctly", async () => {
      const mockTree = [
        {
          name: "CS",
          path: "CS",
          score: 80,
          level: 0,
          children: [
            {
              name: "Algorithms",
              path: "CS/Algorithms",
              score: 70,
              level: 1,
              children: [],
            },
          ],
        },
      ];
      mockMasteryService.getMasteryTree.mockReturnValue(mockTree);

      const res = await app.request("/tree");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual(mockTree);
      expect(mockMasteryService.getMasteryTree).toHaveBeenCalledWith(1); // 验证 userId 为 1 (来自 mock auth)
    });
  });

  describe("GET /stats", () => {
    it("should return hierarchy stats for a tag", async () => {
      mockMasteryService.getHierarchyMastery.mockReturnValue({
        avgScore: 85,
        count: 5,
      });

      const res = await app.request("/stats?tag=CS/Algorithms");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({ avgScore: 85, count: 5 });
      expect(mockMasteryService.getHierarchyMastery).toHaveBeenCalledWith(
        1,
        "CS/Algorithms",
      );
    });

    it("should return 400 if tag is missing", async () => {
      const res = await app.request("/stats");
      expect(res.status).toBe(400);
    });
  });
});
