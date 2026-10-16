// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock statsService
vi.mock("@/lib/services/stats", () => ({
  statsService: {
    getUserStats: vi.fn(),
  },
}));

// Mock Auth 中间件
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
  getCurrentUser: () => ({ id: 1 }),
}));

import { statsService } from "@/lib/services/stats";
import app from "../stats";

describe("Stats Hono 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / - 返回正确的统计数据", async () => {
    vi.mocked(statsService.getUserStats).mockResolvedValue({
      todayPracticed: 5,
      todayCorrect: 4,
      totalPracticed: 100,
      totalCorrect: 80,
      totalSessions: 12,
      streakDays: 3,
      averageMastery: 80,
      weakPoints: [],
      pendingReviewCount: 0,
      observationZoneCount: 0,
      dailyGoal: 25,
      dailyProgress: 20,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.todayCount).toBe(5);
    expect(data.todayCorrect).toBe(4);
    expect(data.todayAccuracy).toBeCloseTo(0.8);
    expect(data.totalCount).toBe(100);
    expect(data.totalCorrect).toBe(80);
    expect(data.overallAccuracy).toBeCloseTo(0.8);
    expect(data.totalSessions).toBe(12);
    expect(data.streakDays).toBe(3);
  });

  it("GET / - 今日无练习记录时 accuracy 为 0", async () => {
    vi.mocked(statsService.getUserStats).mockResolvedValue({
      todayPracticed: 0,
      todayCorrect: 0,
      totalPracticed: 50,
      totalCorrect: 30,
      totalSessions: 5,
      streakDays: 0,
      averageMastery: 60,
      weakPoints: [],
      pendingReviewCount: 0,
      observationZoneCount: 0,
      dailyGoal: 25,
      dailyProgress: 0,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.todayCount).toBe(0);
    expect(data.todayAccuracy).toBe(0);
    expect(data.streakDays).toBe(0);
  });

  it("GET / - 历史无练习记录时 overallAccuracy 为 0", async () => {
    vi.mocked(statsService.getUserStats).mockResolvedValue({
      todayPracticed: 0,
      todayCorrect: 0,
      totalPracticed: 0,
      totalCorrect: 0,
      totalSessions: 0,
      streakDays: 0,
      averageMastery: 0,
      weakPoints: [],
      pendingReviewCount: 0,
      observationZoneCount: 0,
      dailyGoal: 25,
      dailyProgress: 0,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.overallAccuracy).toBe(0);
    expect(data.streakDays).toBe(0);
  });

  it("GET / - 昨天有记录（streak 应计入）", async () => {
    vi.mocked(statsService.getUserStats).mockResolvedValue({
      todayPracticed: 0,
      todayCorrect: 0,
      totalPracticed: 20,
      totalCorrect: 15,
      totalSessions: 3,
      streakDays: 2,
      averageMastery: 75,
      weakPoints: [],
      pendingReviewCount: 0,
      observationZoneCount: 0,
      dailyGoal: 25,
      dailyProgress: 0,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.streakDays).toBe(2);
  });
});
