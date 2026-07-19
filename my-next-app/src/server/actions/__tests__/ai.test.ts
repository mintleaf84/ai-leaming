// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock AI Client & Prompts
const {
  mockGenerateStructuredData,
  mockGenerateTextWrapper,
  mockGetPromptFromDb,
  mockCheckAndConsumeQuota,
  mockDecrementUsage,
} = vi.hoisted(() => ({
  mockGenerateStructuredData: vi.fn(),
  mockGenerateTextWrapper: vi.fn(),
  mockGetPromptFromDb: vi.fn(),
  mockCheckAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
  mockDecrementUsage: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  generateStructuredData: mockGenerateStructuredData,
  generateTextWrapper: mockGenerateTextWrapper,
}));

vi.mock("@/lib/ai/prompts", () => ({
  getPromptFromDb: mockGetPromptFromDb,
  buildPrompt: vi.fn((template, _vars) => template),
  DEFAULT_CORRECTION_PROMPT: "default correction prompt",
  DEFAULT_REGRESSION_PROMPT: "default regression prompt",
}));

vi.mock("@/lib/auth/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, role: "user" }),
}));

vi.mock("@/lib/billing/subscription-service", () => ({
  checkAndConsumeQuota: mockCheckAndConsumeQuota,
  decrementUsage: mockDecrementUsage,
}));

vi.mock("@/lib/services/question", () => ({
  questionService: {
    searchSimilarQuestions: vi.fn(),
  },
}));

vi.mock("@/lib/services/ai-cache", () => ({
  aiCacheService: {
    getQuiz: vi.fn(),
    setQuiz: vi.fn(),
    getChallenge: vi.fn(),
    setChallenge: vi.fn(),
    getFirstPrinciples: vi.fn(),
    setFirstPrinciples: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Import AFTER mocks are set up
import {
  generateCorrectionQuizAction,
  generateRegressionChallengeAction,
  generateFirstPrinciplesAction,
} from "../ai";
import { aiCacheService } from "@/lib/services/ai-cache";
import { questionService } from "@/lib/services/question";

describe("AI Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
    mockDecrementUsage.mockResolvedValue(undefined);
  });

  describe("generateCorrectionQuizAction", () => {
    it("应该返回 AI 生成的测试题并保存到缓存", async () => {
      const mockQuiz = {
        analysis: "Analysis",
        distinctionPoint: "Point",
        quiz: {
          content: "Q",
          options: ["A", "B"],
          answer: "A",
          explanation: "E",
        },
      };
      mockGenerateStructuredData.mockResolvedValue(mockQuiz);
      vi.mocked(aiCacheService.getQuiz).mockResolvedValue(null);
      vi.mocked(aiCacheService.setQuiz).mockResolvedValue(undefined);

      const result = await generateCorrectionQuizAction(
        "Question",
        "Wrong",
        "Correct",
      );

      expect(result).toEqual(mockQuiz);
      expect(aiCacheService.setQuiz).toHaveBeenCalled();
    });

    it("如果缓存命中，应该直接返回缓存结果", async () => {
      const cachedData = { analysis: "Cached" };
      vi.mocked(aiCacheService.getQuiz).mockResolvedValue(cachedData);

      const result = await generateCorrectionQuizAction("Q", "W", "C");

      expect(result).toEqual(cachedData);
      expect(mockGenerateStructuredData).not.toHaveBeenCalled();
    });

    it("如果 force=true，应该跳过缓存直接调用 AI", async () => {
      const mockQuiz = {
        analysis: "Fresh",
        distinctionPoint: "Point",
        quiz: {
          content: "Q",
          options: ["A", "B"],
          answer: "A",
          explanation: "E",
        },
      };
      mockGenerateStructuredData.mockResolvedValue(mockQuiz);

      const result = await generateCorrectionQuizAction("Q", "W", "C", true);

      expect(result).toEqual(mockQuiz);
      expect(mockGenerateStructuredData).toHaveBeenCalled();
    });

    it("应该处理配额不足的情况", async () => {
      // Clear the cache mock to ensure quota check is called
      vi.mocked(aiCacheService.getQuiz).mockResolvedValue(null);
      mockCheckAndConsumeQuota.mockReturnValue({
        allowed: false,
        message: "配额已用完",
      });

      await expect(generateCorrectionQuizAction("Q", "W", "C")).rejects.toThrow(
        "配额已用完",
      );
    });

    it("AI 生成失败时应该使用 RAG 兜底", async () => {
      mockGenerateStructuredData.mockRejectedValue(new Error("AI Error"));
      vi.mocked(aiCacheService.getQuiz).mockResolvedValue(null);

      // Mock RAG 返回相似题
      vi.mocked(questionService.searchSimilarQuestions).mockResolvedValue([
        {
          id: 1,
          content: "RAG Question",
          options: ["A", "B"],
          answer: "A",
          explanation: "RAG explanation",
          tags: ["tag1"],
          dimension: "knowledge",
          type: "single" as const,
        },
      ]);

      const result = await generateCorrectionQuizAction(
        "Question",
        "Wrong",
        "Correct",
      );

      expect(result).toHaveProperty("analysis");
      expect(result.analysis).toContain("检索");
    });

    it("AI 生成失败且无相似题时应该抛出错误", async () => {
      mockGenerateStructuredData.mockRejectedValue(new Error("AI Error"));
      vi.mocked(aiCacheService.getQuiz).mockResolvedValue(null);
      vi.mocked(questionService.searchSimilarQuestions).mockResolvedValue([]);

      await expect(
        generateCorrectionQuizAction("Question", "Wrong", "Correct"),
      ).rejects.toThrow();
    });
  });

  describe("generateRegressionChallengeAction", () => {
    it("应该生成回归挑战练习", async () => {
      const mockChallenge = {
        logicType: "complement",
        challenges: [
          {
            content: "C1",
            options: ["A", "B"],
            answer: "A",
            explanation: "E1",
          },
        ],
      };
      mockGenerateStructuredData.mockResolvedValue(mockChallenge);
      mockGenerateTextWrapper.mockResolvedValue({ text: "YES" });
      vi.mocked(aiCacheService.getChallenge).mockResolvedValue(null);

      const result = await generateRegressionChallengeAction("Question", [
        "tag1",
        "tag2",
      ]);

      expect(result).toEqual(mockChallenge);
    });

    it("如果缓存命中，应该直接返回缓存结果", async () => {
      const cachedData = { logicType: "cached", challenges: [] };
      vi.mocked(aiCacheService.getChallenge).mockResolvedValue(cachedData);

      const result = await generateRegressionChallengeAction("Q", ["tag"]);

      expect(result).toEqual(cachedData);
      expect(mockGenerateStructuredData).not.toHaveBeenCalled();
    });

    it("双重校验失败时应该回滚配额", async () => {
      const mockChallenge = { logicType: "test", challenges: [] };
      mockGenerateStructuredData.mockResolvedValue(mockChallenge);
      mockGenerateTextWrapper.mockResolvedValue({ text: "NO" });
      vi.mocked(aiCacheService.getChallenge).mockResolvedValue(null);
      // Mock RAG to return valid data so it doesn't hit the error path
      vi.mocked(questionService.searchSimilarQuestions).mockResolvedValue([
        {
          id: 2,
          content: "Q1",
          options: ["A", "B"],
          answer: "A",
          explanation: "E1",
          tags: ["tag1"],
          dimension: "knowledge",
          type: "single" as const,
        },
      ]);

      const result = await generateRegressionChallengeAction("Q", ["tag"]);
      // When double insurance fails but RAG succeeds, it returns RAG data
      expect(result).toBeDefined();
    });

    it("应该处理配额不足的情况", async () => {
      vi.mocked(aiCacheService.getChallenge).mockResolvedValue(null);
      mockCheckAndConsumeQuota.mockReturnValue({
        allowed: false,
        message: "配额不足",
      });

      await expect(
        generateRegressionChallengeAction("Q", ["tag"]),
      ).rejects.toThrow("配额不足");
    });

    it("AI 生成失败时应该使用 RAG 兜底", async () => {
      mockGenerateStructuredData.mockRejectedValue(new Error("AI Error"));
      mockGenerateTextWrapper.mockResolvedValue({ text: "YES" });
      vi.mocked(aiCacheService.getChallenge).mockResolvedValue(null);

      vi.mocked(questionService.searchSimilarQuestions).mockResolvedValue([
        {
          id: 3,
          content: "RAG Q1",
          options: ["A", "B"],
          answer: "A",
          explanation: "E1",
          tags: ["tag1"],
          dimension: "knowledge",
          type: "single" as const,
        },
        {
          id: 4,
          content: "RAG Q2",
          options: ["A", "B"],
          answer: "B",
          explanation: "E2",
          tags: ["tag1"],
          dimension: "knowledge",
          type: "single" as const,
        },
        {
          id: 5,
          content: "RAG Q3",
          options: ["A", "B"],
          answer: "A",
          explanation: "E3",
          tags: ["tag1"],
          dimension: "knowledge",
          type: "single" as const,
        },
      ]);

      const result = await generateRegressionChallengeAction("Question", [
        "tag",
      ]);

      expect(result.challenges).toHaveLength(3);
    });
  });

  describe("generateFirstPrinciplesAction", () => {
    it("应该检查配额并返回分析结果", async () => {
      mockGenerateTextWrapper.mockResolvedValue({ text: "Deep Logic" });
      vi.mocked(aiCacheService.getFirstPrinciples).mockResolvedValue(null);
      vi.mocked(aiCacheService.setFirstPrinciples).mockResolvedValue(undefined);

      const result = await generateFirstPrinciplesAction("Q", "Exp", "A", "W");

      expect(result.analysis).toBe("Deep Logic");
      expect(result.cached).toBe(false);
    });

    it("如果缓存命中，应该直接返回缓存结果", async () => {
      vi.mocked(aiCacheService.getFirstPrinciples).mockResolvedValue(
        "Cached Analysis",
      );

      const result = await generateFirstPrinciplesAction("Q", "Exp", "A", "W");

      expect(result.analysis).toBe("Cached Analysis");
      expect(result.cached).toBe(true);
      expect(mockGenerateTextWrapper).not.toHaveBeenCalled();
    });

    it("如果缺少题目内容应该抛出错误", async () => {
      await expect(
        generateFirstPrinciplesAction("", "Exp", "A"),
      ).rejects.toThrow("缺少题目内容");
    });

    it("应该处理配额不足的情况", async () => {
      vi.mocked(aiCacheService.getFirstPrinciples).mockResolvedValue(null);
      mockCheckAndConsumeQuota.mockReturnValue({
        allowed: false,
        message: "今日次数已用完",
      });

      await expect(
        generateFirstPrinciplesAction("Q", "Exp", "A"),
      ).rejects.toThrow("今日次数已用完");
    });

    it("AI 生成失败时应该回滚配额并抛出错误", async () => {
      mockGenerateTextWrapper.mockRejectedValue(new Error("API Error"));
      vi.mocked(aiCacheService.getFirstPrinciples).mockResolvedValue(null);

      await expect(
        generateFirstPrinciplesAction("Q", "Exp", "A"),
      ).rejects.toThrow("AI 分析失败");
      expect(mockDecrementUsage).toHaveBeenCalled();
    });
  });
});
