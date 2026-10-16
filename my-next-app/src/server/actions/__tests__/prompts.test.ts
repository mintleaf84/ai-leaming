// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
// 1. 设置 Mock
const { actualSchema, mockDb } = await vi.hoisted(async () => {
  const modSchema = await import("@/lib/db/drizzle-schema");
  const modUtils = await import("@/lib/__tests__/db-mock-utils");
  const mock = modUtils.createTableAwareDrizzleMock();
  return {
    actualSchema: modSchema,
    mockDb: mock,
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDb,
  drizzleSchema: actualSchema,
}));

vi.mock("@/lib/db/drizzle-schema", () => actualSchema);

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => ({
  mockRequireRole: vi.fn().mockResolvedValue({ id: 1, username: "admin" }),
  mockLogAdminAction: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: mockLogAdminAction }));

vi.mock("@/lib/ai/prompts", () => ({
  buildPrompt: vi.fn(),
  DEFAULT_CORRECTION_PROMPT: "default_correction",
  DEFAULT_REGRESSION_PROMPT: "default_regression",
  DEFAULT_KNOWLEDGE_EXTRACT_PROMPT: "default_knowledge",
  DEFAULT_CHAT_SYSTEM_PROMPT: "default_chat",
  PROMPT_VARIABLE_EXAMPLES: {
    correction_quiz: {},
  },
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => void | Promise<void>) => {
    fn();
  }),
}));

vi.mock("@/lib/ai/client", () => ({
  generateStructuredData: vi.fn(),
  generateTextWrapper: vi.fn(),
}));

import {
  getPromptTemplatesAction,
  savePromptTemplateAction,
  resetPromptTemplateAction,
  debugPromptTemplateAction,
} from "../prompts";
import { resetDrizzleMock } from "@/lib/__tests__/db-mock-utils";

describe("Prompts Actions", () => {
  beforeEach(() => {
    resetDrizzleMock(mockDb);
    mockDb.resetTableData?.();
    vi.clearAllMocks();
  });

  describe("getPromptTemplatesAction", () => {
    it("应该合并数据库模板与系统默认模板", async () => {
      mockDb.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            key: "correction_quiz",
            template: "custom",
            variables: "[]",
            description: "D",
            updated_at: "2024-01-01",
          },
        ]),
      );

      const result = await getPromptTemplatesAction();

      expect(result.data?.length).toBeGreaterThanOrEqual(4);
      const correctionQuiz = result.data?.find(
        (r) => r.key === "correction_quiz",
      );
      expect(correctionQuiz?.template).toBe("custom");
    });
  });

  describe("savePromptTemplateAction", () => {
    it("应该执行 upsert 操作并记录日志", async () => {
      const result = await savePromptTemplateAction({
        key: "test_key",
        template: "template",
        description: "desc",
        variables: ["var1"],
      });
      expect(result.data?.success).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("resetPromptTemplateAction", () => {
    it("应该从数据库删除模板记录", async () => {
      const result = await resetPromptTemplateAction("test_key");
      expect(result.data?.success).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("debugPromptTemplateAction", () => {
    it("应该成功调试 correction_quiz 类型模板", async () => {
      const { generateStructuredData } = await import("@/lib/ai/client");
      vi.mocked(generateStructuredData).mockResolvedValue({
        questions: [{ content: "测试题", options: ["A", "B"], answer: "A" }],
      });

      const buildPromptMock = (await import("@/lib/ai/prompts")).buildPrompt;
      vi.mocked(buildPromptMock).mockReturnValue("interpolated prompt");

      const result = await debugPromptTemplateAction({
        key: "correction_quiz",
        template: "请生成一道关于{{topic}}的题目",
        inputVariables: { topic: "数学" },
      });

      expect(result.data?.success).toBe(true);
      expect(generateStructuredData).toHaveBeenCalled();
    });

    it("应该成功调试 regression_challenge 类型模板", async () => {
      const { generateStructuredData } = await import("@/lib/ai/client");
      vi.mocked(generateStructuredData).mockResolvedValue({
        questions: [{ content: "测试题", options: ["A", "B"], answer: "B" }],
      });

      const buildPromptMock = (await import("@/lib/ai/prompts")).buildPrompt;
      vi.mocked(buildPromptMock).mockReturnValue("interpolated prompt");

      const result = await debugPromptTemplateAction({
        key: "regression_challenge",
        template: "请生成关于{{topic}}的挑战",
        inputVariables: { topic: "历史" },
      });

      expect(result.data?.success).toBe(true);
    });

    it("未知 key 应该使用文本模式调试", async () => {
      const { generateTextWrapper } = await import("@/lib/ai/client");
      vi.mocked(generateTextWrapper).mockResolvedValue({
        text: "AI response text",
      });

      const buildPromptMock = (await import("@/lib/ai/prompts")).buildPrompt;
      vi.mocked(buildPromptMock).mockReturnValue("interpolated prompt");

      const result = await debugPromptTemplateAction({
        key: "unknown_key",
        template: "请处理 {{input}}",
        inputVariables: { input: "test" },
      });

      expect(result.data?.success).toBe(true);
      expect(generateTextWrapper).toHaveBeenCalled();
    });

    it("AI 调用失败应该返回错误信息", async () => {
      const { generateTextWrapper } = await import("@/lib/ai/client");
      vi.mocked(generateTextWrapper).mockRejectedValue(new Error("API Error"));

      const buildPromptMock = (await import("@/lib/ai/prompts")).buildPrompt;
      vi.mocked(buildPromptMock).mockReturnValue("interpolated prompt");

      const result = await debugPromptTemplateAction({
        key: "test_key",
        template: "test",
        inputVariables: {},
      });

      expect(result.serverError).toBeDefined();
    });
  });
});
