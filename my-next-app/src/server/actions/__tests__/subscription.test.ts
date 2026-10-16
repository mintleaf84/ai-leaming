// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// 1. Mock Auth
vi.mock("@/lib/auth/auth", () => ({
  requireRole: vi.fn(),
  requireUser: vi.fn(),
}));

import { requireRole, requireUser } from "@/lib/auth/auth";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// 2. Mock Billing Service
const { mockBillingService } = vi.hoisted(() => {
  return {
    mockBillingService: {
      getAllPlans: vi.fn(),
      deletePlan: vi.fn(),
      getUserSubscriptionDetail: vi.fn(),
      checkUsageQuota: vi.fn(),
      getPlanById: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      getSubscriptionStats: vi.fn(),
      getDailyUsage: vi.fn(),
      upsertPlan: vi.fn(),
    },
  };
});

vi.mock("@/lib/billing/subscription-service", () => mockBillingService);

import {
  getPlansAction,
  deletePlanAction,
  getMySubscriptionAction,
  checkQuotaAction,
} from "../subscription";

describe("Subscription Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPlansAction", () => {
    it("should return plans for admin", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.getAllPlans.mockReturnValue([
        { id: "pro", name: "Pro" },
      ]);

      const result = await getPlansAction(false);

      expect(result.data?.success).toBe(true);
      expect(result.data?.plans).toHaveLength(1);
      expect(requireRole).toHaveBeenCalledWith(["admin"]);
    });

    it("should handle errors", async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

      const result = await getPlansAction(false);

      expect(result.data?.success).toBeFalsy();
      expect(result.serverError).toBe("Forbidden");
    });
  });

  describe("deletePlanAction", () => {
    it("should delete plan successfully", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.deletePlan.mockReturnValue({ success: true });

      const result = await deletePlanAction("plan_123");

      expect(result.data?.success).toBe(true);
      expect(mockBillingService.deletePlan).toHaveBeenCalledWith("plan_123");
    });

    it("should return error if service fails", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.deletePlan.mockReturnValue({
        success: false,
        error: "In use",
      });

      const result = await deletePlanAction("plan_123");

      expect(result.data?.success).toBeFalsy();
      expect(result.serverError).toBe("In use");
    });
  });

  describe("getMySubscriptionAction", () => {
    it("should return user subscription", async () => {
      vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
      mockBillingService.getUserSubscriptionDetail.mockReturnValue({
        plan: { name: "Free" },
      });

      const result = await getMySubscriptionAction();

      expect(result.data?.success).toBe(true);
      expect(result.data?.subscription).toBeDefined();
      expect(mockBillingService.getUserSubscriptionDetail).toHaveBeenCalledWith(
        10,
      );
    });
  });

  describe("checkQuotaAction", () => {
    it("should return true if quota allows", async () => {
      vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
      mockBillingService.checkUsageQuota.mockReturnValue({
        allowed: true,
        remaining: 5,
      });

      // @ts-ignore - enum usage in test
      const result = await checkQuotaAction("ai_chat");

      expect(result.data?.success).toBe(true);
      expect(result.data?.allowed).toBe(true);
      expect(mockBillingService.checkUsageQuota).toHaveBeenCalledWith(
        10,
        "ai_chat",
      );
    });

    it("should return false if quota exceeded", async () => {
      vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
      mockBillingService.checkUsageQuota.mockReturnValue({
        allowed: false,
        remaining: 0,
      });

      // @ts-ignore - intentional test input
      const result = await checkQuotaAction("ai_chat");

      expect(result.data?.success).toBe(true); // Action succeeded, but result is not allowed
      expect(result.data?.allowed).toBe(false);
    });

    it("should handle unauthenticated user", async () => {
      vi.mocked(requireUser).mockRejectedValue(new Error("Unauthorized"));

      // @ts-ignore - intentional test input
      const result = await checkQuotaAction("ai_chat");

      expect(result.data?.success).toBeFalsy();
      expect(result.data?.allowed).toBeFalsy();
    });
  });

  describe("getActivePlansAction", () => {
    it("should return active plans without auth", async () => {
      mockBillingService.getAllPlans.mockReturnValue([
        { id: "free", name: "Free", price: 0 },
        { id: "pro", name: "Pro", price: 99 },
      ]);

      const { getActivePlansAction } = await import("../subscription");
      const result = await getActivePlansAction();

      expect(result.data?.success).toBe(true);
      expect(result.data?.plans).toHaveLength(2);
    });
  });

  describe("setUserSubscriptionAction", () => {
    it("should set user subscription", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.getPlanById.mockReturnValue({
        id: "pro",
        name: "Pro",
      });
      mockBillingService.createSubscription.mockReturnValue({ success: true });

      const { setUserSubscriptionAction } = await import("../subscription");
      const result = await setUserSubscriptionAction({
        userId: 10,
        planId: "pro",
        durationMonths: 1,
      });

      expect(result.data?.success).toBe(true);
      expect(mockBillingService.createSubscription).toHaveBeenCalled();
    });

    it("should fail if plan not found", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.getPlanById.mockReturnValue(null);

      const { setUserSubscriptionAction } = await import("../subscription");
      const result = await setUserSubscriptionAction({
        userId: 10,
        planId: "invalid",
        durationMonths: 1,
      });

      expect(result.serverError).toBeDefined();
    });
  });

  describe("cancelUserSubscriptionAction", () => {
    it("should cancel user subscription", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.cancelSubscription.mockReturnValue({ success: true });

      const { cancelUserSubscriptionAction } = await import("../subscription");
      const result = await cancelUserSubscriptionAction(10);

      expect(result.data?.success).toBe(true);
      expect(mockBillingService.cancelSubscription).toHaveBeenCalledWith(10);
    });
  });

  describe("getSubscriptionStatsAction", () => {
    it("should return subscription stats", async () => {
      vi.mocked(requireRole).mockResolvedValue({ id: 1, role: "admin" } as any);
      mockBillingService.getSubscriptionStats.mockReturnValue({
        totalUsers: 100,
        activeSubscriptions: 50,
      });

      const { getSubscriptionStatsAction } = await import("../subscription");
      const result = await getSubscriptionStatsAction();

      expect(result.data?.success).toBe(true);
      expect(result.data?.stats).toBeDefined();
    });
  });

  describe("getMyUsageAction", () => {
    it("should return user usage and limits", async () => {
      vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
      mockBillingService.getDailyUsage.mockReturnValue({
        ai_chat: 5,
        practice: 10,
      });
      mockBillingService.getUserSubscriptionDetail.mockReturnValue({
        plan: { name: "Pro", limits: { ai_chat: 100, practice: 200 } },
      });

      const { getMyUsageAction } = await import("../subscription");
      const result = await getMyUsageAction();

      expect(result.data?.success).toBe(true);
      expect(result.data?.usage).toBeDefined();
      expect(result.data?.limits).toBeDefined();
    });
  });

  describe("savePlanAction", () => {
    it("should require admin role", async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

      const { savePlanAction } = await import("../subscription");
      const result = await savePlanAction({
        id: "pro",
        name: "Pro",
        price_monthly: 99,
        limits: { ai_chat: 100 },
        features: [],
        is_active: 1,
      });

      expect(result.serverError).toBeDefined();
    });
  });
});
