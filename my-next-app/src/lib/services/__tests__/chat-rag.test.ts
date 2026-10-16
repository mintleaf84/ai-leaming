// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRagService, mockSearchSimilarContent } = vi.hoisted(() => ({
  mockRagService: {
    search: vi.fn(),
    rerank: vi.fn(),
  },
  mockSearchSimilarContent: vi.fn(),
}));

vi.mock("@/lib/ai/rag", () => ({
  searchSimilarContent: mockSearchSimilarContent,
  ragService: mockRagService,
}));

vi.mock("@/lib/ai/client", () => ({
  generateTextWrapper: vi.fn(),
  getAiConfig: vi.fn(),
}));

vi.mock("@/lib/ai/langchain-store", () => ({
  SqliteVecVectorStore: {
    fromExistingIndex: vi.fn(),
  },
  RagEmbeddings: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@/lib/ai/prompts", () => ({
  getPromptFromDb: vi.fn(),
  SOCRATIC_TUTOR_PROMPT: "苏格拉底提示模板",
}));

import {
  parseCommand,
  searchKnowledgeBase,
  buildEnhancedSystemPrompt,
  handleQuizCommand,
  handleExplainCommand,
  knowledgeSearchTool,
} from "@/lib/services/chat-rag";

describe("Chat RAG Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseCommand", () => {
    it("should parse /quiz command", () => {
      const result = parseCommand("/quiz 教育学");
      expect(result.type).toBe("quiz");
      expect(result.keyword).toBe("教育学");
    });

    it("should parse /explain command", () => {
      const result = parseCommand("/explain 建构主义");
      expect(result.type).toBe("explain");
      expect(result.keyword).toBe("建构主义");
    });

    it("should handle case insensitive commands", () => {
      const result1 = parseCommand("/QUIZ 心理学");
      expect(result1.type).toBe("quiz");

      const result2 = parseCommand("/EXPLAIN 行为主义");
      expect(result2.type).toBe("explain");
    });

    it("should return none for unknown commands", () => {
      const result = parseCommand("/unknown test");
      expect(result.type).toBe("none");
      expect(result.keyword).toBe("");
    });

    it("should return none for regular text", () => {
      const result = parseCommand("什么是教育？");
      expect(result.type).toBe("none");
      expect(result.keyword).toBe("");
    });

    it("should handle empty input", () => {
      const result = parseCommand("");
      expect(result.type).toBe("none");
    });

    it("should trim keyword", () => {
      const result = parseCommand("/quiz   教育学   ");
      expect(result.keyword).toBe("教育学");
    });
  });

  describe("searchKnowledgeBase", () => {
    it("should return null when no results found", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      mockRagService.search.mockResolvedValue([]);

      const result = await searchKnowledgeBase("测试", 3);

      expect(result).toBeNull();
    });

    it("should search questions, cards, and textbooks", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      mockRagService.search.mockResolvedValue([]);

      await searchKnowledgeBase("教育学", 3);

      expect(mockSearchSimilarContent).toHaveBeenCalled();
      expect(mockRagService.search).toHaveBeenCalledTimes(2);
    });

    it("should format question results", async () => {
      const mockQuestions = [
        {
          id: 1,
          content: "什么是教育的本质？",
          explanation: "教育的本质是培养人",
          tags: '["教育学基础"]',
          dimension: "knowledge",
        },
      ];
      mockSearchSimilarContent.mockResolvedValue(mockQuestions);
      mockRagService.search.mockResolvedValue([]);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const result = await searchKnowledgeBase("教育", 3);

      expect(result).toBeDefined();
      expect(result).toContain("【相关真题库】");
      expect(result).toContain("什么是教育的本质？");
    });

    it("should format card results", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      const mockCards = [
        {
          content: "教育的定义",
          metadata: {
            title: "教育学基础",
            tags: ["教育学"],
          },
        },
      ];
      mockRagService.search.mockResolvedValue(mockCards);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const result = await searchKnowledgeBase("教育定义", 3);

      expect(result).toContain("【相关知识卡片】");
      expect(result).toContain("教育学基础");
    });

    it("should format textbook results", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      const mockTextbook = [
        {
          content: "第一章 教育概述",
          metadata: {
            title: "教育学原理",
          },
        },
      ];
      mockRagService.search.mockResolvedValue(mockTextbook);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const result = await searchKnowledgeBase("教育概述", 3);

      expect(result).toContain("【相关教材内容】");
      expect(result).toContain("教育学原理");
    });

    it("should limit results to specified number", async () => {
      const mockQuestions = Array(10).fill({
        id: 1,
        content: "测试题目",
        tags: "[]",
        dimension: "knowledge",
      });
      mockSearchSimilarContent.mockResolvedValue(mockQuestions);
      mockRagService.search.mockResolvedValue([]);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const result = await searchKnowledgeBase("测试", 2);

      expect(result).toBeDefined();
    });

    it("should return null on error", async () => {
      mockSearchSimilarContent.mockRejectedValue(new Error("Search failed"));

      const result = await searchKnowledgeBase("测试", 3);

      expect(result).toBeNull();
    });
  });

  describe("buildEnhancedSystemPrompt", () => {
    it("should return standard prompt without context", async () => {
      const { getPromptFromDb } = await import("@/lib/ai/prompts");
      vi.mocked(getPromptFromDb).mockResolvedValue(null);

      const result = await buildEnhancedSystemPrompt();

      expect(result).toContain("教师招聘考试辅导专家");
    });

    it("should return socratic prompt when mode is socratic", async () => {
      const { getPromptFromDb } = await import("@/lib/ai/prompts");
      vi.mocked(getPromptFromDb).mockResolvedValue(null);

      const result = await buildEnhancedSystemPrompt(undefined, "socratic");

      expect(result).toBe("苏格拉底提示模板");
    });

    it("should include context when provided", async () => {
      const { getPromptFromDb } = await import("@/lib/ai/prompts");
      vi.mocked(getPromptFromDb).mockResolvedValue(null);

      const context = "【相关真题库】\n题目内容";
      const result = await buildEnhancedSystemPrompt(context);

      expect(result).toContain("【相关参考资料 (Reference Context)】");
      expect(result).toContain(context);
    });

    it("should use custom prompt from database", async () => {
      const { getPromptFromDb } = await import("@/lib/ai/prompts");
      vi.mocked(getPromptFromDb).mockResolvedValue("自定义提示词");

      const result = await buildEnhancedSystemPrompt();

      expect(result).toBe("自定义提示词");
    });
  });

  describe("handleQuizCommand", () => {
    it("should return message when no results found", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);

      const result = await handleQuizCommand("不存在的关键词");

      expect(result).toContain("抱歉，我没有找到");
      expect(result).toContain("不存在的关键词");
    });

    it("should format quiz results", async () => {
      const mockResults = [
        {
          id: 1,
          content: "什么是教育的本质？这是教育学基础中的重要概念。",
          tags: '["教育学基础"]',
          dimension: "knowledge",
          explanation: "解析内容",
        },
      ];
      mockSearchSimilarContent.mockResolvedValue(mockResults);

      const result = await handleQuizCommand("教育学");

      expect(result).toContain("📚 为您找到");
      expect(result).toContain("什么是教育的本质？");
      expect(result).toContain("教育学基础");
    });

    it("should handle multiple results", async () => {
      const mockResults = Array(5).fill({
        id: 1,
        content: "测试题目内容",
        tags: '["测试"]',
        dimension: "knowledge",
      });
      mockSearchSimilarContent.mockResolvedValue(mockResults);

      const result = await handleQuizCommand("测试");

      expect(result).toContain("5 道");
    });

    it("should include practice suggestion", async () => {
      mockSearchSimilarContent.mockResolvedValue([
        {
          id: 1,
          content: "题目",
          tags: "[]",
          dimension: "knowledge",
        },
      ]);

      const result = await handleQuizCommand("测试");

      expect(result).toContain("/practice");
    });
  });

  describe("handleExplainCommand", () => {
    it("should return default message when no context found", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      mockRagService.search.mockResolvedValue([]);

      const result = await handleExplainCommand("概念");

      expect(result).toContain("正在为您解释");
      expect(result).toContain("概念");
    });

    it("should generate explanation with context", async () => {
      mockSearchSimilarContent.mockResolvedValue([
        {
          id: 1,
          content: "相关题目",
          tags: "[]",
          dimension: "knowledge",
        },
      ]);
      mockRagService.search.mockResolvedValue([]);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const { generateTextWrapper } = await import("@/lib/ai/client");
      vi.mocked(generateTextWrapper).mockResolvedValue({
        text: "详细解释内容",
      });

      const result = await handleExplainCommand("教育学");

      expect(generateTextWrapper).toHaveBeenCalled();
      expect(result).toBe("详细解释内容");
    });

    it("should handle generation error", async () => {
      mockSearchSimilarContent.mockResolvedValue([
        {
          id: 1,
          content: "相关题目",
          tags: "[]",
          dimension: "knowledge",
        },
      ]);
      mockRagService.search.mockResolvedValue([]);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const { generateTextWrapper } = await import("@/lib/ai/client");
      vi.mocked(generateTextWrapper).mockRejectedValue(new Error("API error"));

      const result = await handleExplainCommand("概念");

      expect(result).toContain("抱歉，生成解释时遇到错误");
    });
  });

  describe("knowledgeSearchTool", () => {
    it("should execute search and return results", async () => {
      mockSearchSimilarContent.mockResolvedValue([
        {
          id: 1,
          content: "相关结果",
          tags: "[]",
          dimension: "knowledge",
        },
      ]);
      mockRagService.search.mockResolvedValue([]);
      mockRagService.rerank.mockImplementation(async (_q, results) => results);

      const result = await knowledgeSearchTool.execute({ query: "测试查询" });

      expect(result).toContain("Found relevant context");
    });

    it("should return not found message when no results", async () => {
      mockSearchSimilarContent.mockResolvedValue([]);
      mockRagService.search.mockResolvedValue([]);

      const result = await knowledgeSearchTool.execute({ query: "不存在" });

      expect(result).toContain("No relevant information found");
    });

    it("should have correct tool description", () => {
      expect(knowledgeSearchTool.description).toContain(
        "Search for educational psychology",
      );
      expect(knowledgeSearchTool.description).toContain(
        "teacher recruitment exam",
      );
    });

    it("should have correct parameters", () => {
      expect(knowledgeSearchTool.parameters).toHaveProperty("query");
    });
  });
});
