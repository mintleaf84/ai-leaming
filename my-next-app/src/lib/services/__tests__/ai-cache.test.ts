// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Drizzle Mock ----
const { mockDrizzleDb, mockDrizzleSchema, mockGet, mockRun } = vi.hoisted(
  () => {
    const mockGet = vi.fn();
    const mockRun = vi.fn();

    const chain: Record<string, unknown> = {};
    const chainMethods = [
      "select",
      "from",
      "where",
      "insert",
      "values",
      "onConflictDoUpdate",
    ];
    chainMethods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });

    // 添加执行方法
    chain["get"] = mockGet;
    chain["run"] = mockRun;

    const mockDrizzleDb: Record<string, ReturnType<typeof vi.fn>> = {
      ...chain,
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      get: mockGet,
      run: mockRun,
    };

    const mockDrizzleSchema = {
      ai_quiz_cache: { hash: "ai_quiz_cache.hash", data: "ai_quiz_cache.data" },
      ai_challenge_cache: {
        hash: "ai_challenge_cache.hash",
        data: "ai_challenge_cache.data",
      },
      first_principles_cache: {
        question_hash: "first_principles_cache.question_hash",
        analysis: "first_principles_cache.analysis",
      },
    };

    return { mockDrizzleDb, mockDrizzleSchema, mockGet, mockRun, chain };
  },
);

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema,
}));

import { aiCacheService } from "@/lib/services/ai-cache";

describe("aiCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 重置链式调用
    const chainMethods = [
      "select",
      "from",
      "where",
      "insert",
      "values",
      "onConflictDoUpdate",
    ];
    chainMethods.forEach((m) => {
      (
        mockDrizzleDb[m as keyof typeof mockDrizzleDb] as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue(mockDrizzleDb);
    });

    // 默认终止方法返回空
    mockGet.mockResolvedValue(null);
    mockRun.mockResolvedValue({ rowsAffected: 1 });
  });

  // ────────────────────────────
  // getQuiz / setQuiz
  // ────────────────────────────
  describe("getQuiz", () => {
    it("应该返回解析后的缓存数据", async () => {
      const mockData = { question: "测试问题", options: ["A", "B", "C", "D"] };
      mockGet.mockResolvedValueOnce({
        hash: "abc123",
        data: JSON.stringify(mockData),
      });

      const result = await aiCacheService.getQuiz("abc123");

      expect(result).toEqual(mockData);
      expect(mockDrizzleDb.select).toHaveBeenCalled();
      expect(mockDrizzleDb.from).toHaveBeenCalledWith(
        mockDrizzleSchema.ai_quiz_cache,
      );
      expect(mockDrizzleDb.where).toHaveBeenCalled();
    });

    it("缓存不存在时应返回 null", async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await aiCacheService.getQuiz("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("setQuiz", () => {
    it("应该正确保存数据到缓存", async () => {
      const data = { question: "新问题", answer: "A" };

      await aiCacheService.setQuiz("hash123", data);

      expect(mockDrizzleDb.insert).toHaveBeenCalledWith(
        mockDrizzleSchema.ai_quiz_cache,
      );
      expect(mockDrizzleDb.values).toHaveBeenCalledWith({
        hash: "hash123",
        data: JSON.stringify(data),
      });
      expect(mockDrizzleDb.onConflictDoUpdate).toHaveBeenCalledWith({
        target: mockDrizzleSchema.ai_quiz_cache.hash,
        set: { data: JSON.stringify(data) },
      });
    });
  });

  // ────────────────────────────
  // getChallenge / setChallenge
  // ────────────────────────────
  describe("getChallenge", () => {
    it("应该返回解析后的缓存数据", async () => {
      const mockData = { challenge: "挑战内容", difficulty: "hard" };
      mockGet.mockResolvedValueOnce({
        hash: "challenge123",
        data: JSON.stringify(mockData),
      });

      const result = await aiCacheService.getChallenge("challenge123");

      expect(result).toEqual(mockData);
      expect(mockDrizzleDb.from).toHaveBeenCalledWith(
        mockDrizzleSchema.ai_challenge_cache,
      );
    });

    it("缓存不存在时应返回 null", async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await aiCacheService.getChallenge("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("setChallenge", () => {
    it("应该正确保存数据到缓存", async () => {
      const data = { challenge: "回归挑战", hint: "这是提示" };

      await aiCacheService.setChallenge("hash456", data);

      expect(mockDrizzleDb.insert).toHaveBeenCalledWith(
        mockDrizzleSchema.ai_challenge_cache,
      );
      expect(mockDrizzleDb.values).toHaveBeenCalledWith({
        hash: "hash456",
        data: JSON.stringify(data),
      });
    });
  });

  // ────────────────────────────
  // getFirstPrinciples / setFirstPrinciples
  // ────────────────────────────
  describe("getFirstPrinciples", () => {
    it("应该返回分析结果", async () => {
      const mockAnalysis = "这是第一性原理分析内容";
      mockGet.mockResolvedValueOnce({
        question_hash: "q123",
        analysis: mockAnalysis,
      });

      const result = await aiCacheService.getFirstPrinciples("q123");

      expect(result).toBe(mockAnalysis);
      expect(mockDrizzleDb.from).toHaveBeenCalledWith(
        mockDrizzleSchema.first_principles_cache,
      );
    });

    it("缓存不存在时应返回 null", async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await aiCacheService.getFirstPrinciples("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("setFirstPrinciples", () => {
    it("应该正确保存分析结果", async () => {
      const analysis = "深入分析：这个问题涉及到...";

      await aiCacheService.setFirstPrinciples("q789", analysis);

      expect(mockDrizzleDb.insert).toHaveBeenCalledWith(
        mockDrizzleSchema.first_principles_cache,
      );
      expect(mockDrizzleDb.values).toHaveBeenCalledWith({
        question_hash: "q789",
        analysis,
      });
      expect(mockDrizzleDb.onConflictDoUpdate).toHaveBeenCalledWith({
        target: mockDrizzleSchema.first_principles_cache.question_hash,
        set: { analysis },
      });
    });
  });
});
