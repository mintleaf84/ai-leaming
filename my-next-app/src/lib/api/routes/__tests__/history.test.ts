// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../history";

// Mock dependencies
const { mockHistoryService } = vi.hoisted(() => {
  return {
    mockHistoryService: {
      getHistory: vi.fn(),
      getSessionDetail: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/history", () => ({
  historyService: mockHistoryService,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
  getCurrentUser: () => ({ id: 1 }),
}));

describe("History Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHistoryService.getHistory.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
  });

  describe("GET /", () => {
    it("should return user history", async () => {
      mockHistoryService.getHistory.mockResolvedValue({
        items: [
          {
            id: "1",
            totalQuestions: 10,
            correctCount: 8,
            reviewCount: 0,
            createdAt: "2023-01-01",
            accuracy: 0.8,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
    });
  });

  /**
   * 分页对拍：`page`/`pageSize` → `historyService.getHistory(userId, {...})`。
   *
   * 改前（main 200b8469）实际传给 service 的值（用探针跑原代码记录）：
   * | query                        | 改前            | 改后        |
   * | ---------------------------- | --------------- | ----------- |
   * | （无）                       | {1, 10}         | {1, 10}     |
   * | ?page=2&pageSize=20          | {2, 20}         | {2, 20}     |
   * | ?page=3&pageSize=5&mode=exam | {3, 5, exam}    | 同          |
   * | ?page=abc&pageSize=abc       | {NaN, NaN}      | {1, 10} ← 修 |
   * | ?page=&pageSize=             | {NaN, NaN}      | {1, 10} ← 修 |
   * | ?page=12oops&pageSize=12oops | {12, 12}        | {1, 10} ← 修 |
   * | ?page=0&pageSize=0           | {0, 0}          | {1, 10}     |
   * | ?page=-5&pageSize=-5         | {-5, -5}        | {1, 10} ← 修 |
   * | ?pageSize=999                | {1, 999}        | {1, 100} ← 夹 |
   *
   * 前三行是合法输入：改前改后逐字节一致（`pageSize` 默认仍为 10，不是 20）。
   * 后五行全部是非法输入：改前 NaN/负数/静默截断会一路下沉到 service
   * （service 里 `page || 1`、`pageSize || 10` 只能兜住 NaN/0，兜不住 -5 与 999）。
   */
  describe("GET / — 分页对拍（page/pageSize 契约）", () => {
    async function callHistory(path: string) {
      mockHistoryService.getHistory.mockClear();
      const res = await app.request(path);
      expect(res.status).toBe(200);
      return mockHistoryService.getHistory.mock.calls[0][1];
    }

    it("合法输入：默认 page=1 pageSize=10（保持原 .default('10')）", async () => {
      expect(await callHistory("/")).toEqual({ page: 1, pageSize: 10 });
    });

    it("合法输入：page=2&pageSize=20 原样透传", async () => {
      expect(await callHistory("/?page=2&pageSize=20")).toEqual({
        page: 2,
        pageSize: 20,
      });
    });

    it("合法输入：mode 等其它筛选参数不受影响", async () => {
      expect(await callHistory("/?page=3&pageSize=5&mode=exam")).toEqual({
        page: 3,
        pageSize: 5,
        mode: "exam",
      });
    });

    it("非法输入：abc / 空串不再把 NaN 传给 service", async () => {
      for (const path of [
        "/?page=abc&pageSize=abc",
        "/?page=&pageSize=",
        "/?page=12oops&pageSize=12oops",
      ]) {
        const args = await callHistory(path);
        expect(args).toEqual({ page: 1, pageSize: 10 });
        expect(Number.isNaN(args.page)).toBe(false);
        expect(Number.isNaN(args.pageSize)).toBe(false);
      }
    });

    it("非法输入：page=0 / 负数 → 1；pageSize=0 / 负数 → 10（不再下沉到 SQL）", async () => {
      expect(await callHistory("/?page=0&pageSize=0")).toEqual({
        page: 1,
        pageSize: 10,
      });
      expect(await callHistory("/?page=-5&pageSize=-5")).toEqual({
        page: 1,
        pageSize: 10,
      });
    });

    it("pageSize 超过 100 截断到 100", async () => {
      expect(await callHistory("/?pageSize=999")).toEqual({
        page: 1,
        pageSize: 100,
      });
    });
  });
});
