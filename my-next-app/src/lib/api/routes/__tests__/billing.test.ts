// @vitest-environment node
/**
 * billing 路由 GET /plans（Flutter pricing_screen 消费 data['plans']，
 * plan 字段 name/slug/priceCents/features）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../billing";

const { mockSubscriptionService, mockAuthMiddleware } = vi.hoisted(() => {
  return {
    mockSubscriptionService: {
      getAllPlans: vi.fn(),
    },
    mockAuthMiddleware: vi.fn(async (c: any, next: any) => {
      c.set("user", { id: 1 });
      await next();
    }),
  };
});

vi.mock("@/lib/billing/subscription-service", () => ({
  getAllPlans: mockSubscriptionService.getAllPlans,
}));

// Mock Auth Middleware：默认登录（id:1），未登录用例里临时改写实现
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: mockAuthMiddleware,
  getCurrentUser: () => ({ id: 1 }),
}));

describe("Billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /plans", () => {
    it("返回 plans 数组，字段对齐 Flutter _defaultPlans（name/slug/priceCents/features）", async () => {
      mockSubscriptionService.getAllPlans.mockResolvedValue([
        {
          id: "free",
          name: "免费版",
          tier: "free",
          price_monthly: 0,
          limits: {},
          features: ["每日 20 题练习", "基础 AI 解析"],
          is_active: true,
          sort_order: 0,
        },
        {
          id: "basic",
          name: "基础版",
          tier: "basic",
          price_monthly: 1900,
          limits: {},
          features: ["无限题目练习", "完整 AI 复盘引擎"],
          is_active: true,
          sort_order: 1,
        },
      ]);

      const res = await app.request("/plans");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.plans)).toBe(true);
      expect(data.plans).toHaveLength(2);
      expect(data.plans[0].name).toBe("免费版");
      expect(data.plans[0].slug).toBe("free");
      expect(data.plans[0].priceCents).toBe(0);
      expect(data.plans[0].features).toEqual([
        "每日 20 题练习",
        "基础 AI 解析",
      ]);
      expect(data.plans[1].slug).toBe("basic");
      expect(data.plans[1].priceCents).toBe(1900);
      expect(mockSubscriptionService.getAllPlans).toHaveBeenCalledWith(true);
    });

    it("未登录返回 401", async () => {
      // 临时改为拒绝：模拟未登录（不调用 next）
      mockAuthMiddleware.mockImplementationOnce(async (c: any) => {
        return c.json({ error: "Unauthorized: No token provided" }, 401);
      });

      const res = await app.request("/plans");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
      expect(mockSubscriptionService.getAllPlans).not.toHaveBeenCalled();
    });
  });
});
