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
    mockQuestionService.list.mockResolvedValue({ items: [], total: 0 });
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

  /**
   * 分页对拍：`page`/`limit` → `questionService.list({offset, limit})`。
   *
   * 改前（main 200b8469）实际传给 service 的值（用探针跑原代码记录）：
   * | query                                | 改前         | 改后      |
   * | ------------------------------------ | ------------ | --------- |
   * | （无）                               | {0, 20}      | {0, 20}   |
   * | ?page=1&limit=20                     | {0, 20}      | {0, 20}   |
   * | ?page=2&limit=100000                 | {100, 100}   | {100, 100}|
   * | ?page=2&limit=100&search=x&type=...  | {100, 100,..}| 同        |
   * | ?page=abc&limit=abc                  | {0, 20}      | {0, 20}   |
   * | ?page=0&limit=0                      | {0, 20}      | {0, 20}   |
   * | ?page=-5&limit=-5                    | {0, 20}      | {0, 20}   |
   * | ?page=12oops&limit=12oops            | {220, 20}    | {0, 20} ← 修 |
   *
   * 合法输入逐字节一致；唯一变化是 `page=12oops`——改前 `parseInt` 静默得 12
   * （offset 220），改后按非法值回落 page=1。负数 page 改前已被
   * `Math.max(1, ...)` 夹住，故无差异。
   */
  describe("GET / — 分页对拍（page/limit 契约）", () => {
    async function callList(path: string) {
      mockQuestionService.list.mockClear();
      const res = await app.request(path);
      expect(res.status).toBe(200);
      return mockQuestionService.list.mock.calls[0][0];
    }

    it("合法输入：默认 page=1 limit=20 → offset 0", async () => {
      expect(await callList("/")).toEqual({
        offset: 0,
        limit: 20,
        search: undefined,
        type: undefined,
      });
      expect(await callList("/?page=1&limit=20")).toEqual({
        offset: 0,
        limit: 20,
        search: undefined,
        type: undefined,
      });
    });

    it("合法输入：page=3&limit=25 → offset 50", async () => {
      expect(await callList("/?page=3&limit=25")).toEqual({
        offset: 50,
        limit: 25,
        search: undefined,
        type: undefined,
      });
    });

    it("合法输入：search/type 与分页互不影响", async () => {
      expect(await callList("/?page=2&limit=100&search=x&type=single")).toEqual(
        {
          offset: 100,
          limit: 100,
          search: "x",
          type: ["single"],
        },
      );
    });

    it("limit=100000 被夹到 100，offset 按夹后的 limit 计算", async () => {
      expect(await callList("/?page=2&limit=100000")).toEqual({
        offset: 100, // (2-1) * 100，而不是 (2-1) * 100000
        limit: 100,
        search: undefined,
        type: undefined,
      });
    });

    it("非法输入：abc / 空串 / 0 / 负数 一律回落默认值，不产生 NaN", async () => {
      for (const path of [
        "/?page=abc&limit=abc",
        "/?page=&limit=",
        "/?page=0&limit=0",
        "/?page=-5&limit=-5",
      ]) {
        const args = await callList(path);
        expect(args.offset).toBe(0);
        expect(args.limit).toBe(20);
        expect(Number.isNaN(args.offset)).toBe(false);
      }
    });

    it("page=12oops 不再被 parseInt 静默当成 12（改前 offset=220）", async () => {
      expect(await callList("/?page=12oops&limit=12oops")).toEqual({
        offset: 0,
        limit: 20,
        search: undefined,
        type: undefined,
      });
    });
  });
});
