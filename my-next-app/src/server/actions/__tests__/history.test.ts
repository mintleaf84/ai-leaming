// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth - MUST be before imports
const { mockRequireRole } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  requireRole: mockRequireRole,
  requireUser: mockRequireRole,
}));

// Mock services
vi.mock("@/lib/services/history", () => ({
  historyService: {
    getHistory: vi.fn(),
    getSessionDetail: vi.fn(),
    deleteSession: vi.fn(),
    getAvailableModes: vi.fn(),
    renameSession: vi.fn(),
    getAnalysisReport: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utils/export-markdown", () => ({
  formatSessionToMarkdown: vi.fn((detail) => "# Test Session\n\nContent here"),
  generateExportFilename: vi.fn((date) => "export-2026-01-17.md"),
}));

// Import AFTER mocks are set up
import {
  getSessionHistoryAction,
  getSessionDetailAction,
  deleteSessionAction,
  getAvailableModesAction,
  renameSessionAction,
  exportSessionMarkdownAction,
} from "../history";
import { historyService } from "@/lib/services/history";

describe("History Actions", () => {
  const testUser = { id: 1, username: "testuser" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(testUser);
  });

  // ========== getSessionHistoryAction 测试 ==========
  describe("getSessionHistoryAction", () => {
    it("应该返回分页的会话历史", async () => {
      vi.mocked(historyService.getHistory).mockResolvedValue({
        items: [
          {
            id: "session-1",
            sessionName: "S1",
            totalQuestions: 10,
            correctCount: 8,
            reviewCount: 2,
            createdAt: "2026-01-17T00:00:00Z",
            accuracy: 80,
            practiceMode: "normal",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const result = await getSessionHistoryAction(undefined);

      expect(result?.data?.total).toBe(1);
      expect(result?.data?.items).toHaveLength(1);
      expect(result?.data?.items?.[0].accuracy).toBe(80);
      expect(historyService.getHistory).toHaveBeenCalledWith(1, {});
    });

    it("应该支持传入筛选条件", async () => {
      vi.mocked(historyService.getHistory).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const result = await getSessionHistoryAction({
        dateFrom: "2026-01-15",
        mode: "normal",
      });

      // Just verify getHistory was called, don't check exact params
      expect(historyService.getHistory).toHaveBeenCalled();
      expect(
        vi.mocked(historyService.getHistory).mock.calls[0][1],
      ).toHaveProperty("dateFrom", "2026-01-15");
      expect(
        vi.mocked(historyService.getHistory).mock.calls[0][1],
      ).toHaveProperty("mode", "normal");
    });
  });

  // ========== getSessionDetailAction 测试 ==========
  describe("getSessionDetailAction", () => {
    it("应该返回会话详情", async () => {
      vi.mocked(historyService.getSessionDetail).mockResolvedValue({
        session: {
          id: "session-1",
          sessionName: "Test Session",
          totalQuestions: 5,
          correctCount: 4,
          reviewCount: 1,
          createdAt: "2026-01-17T00:00:00Z",
          accuracy: 80,
          practiceMode: "normal",
        },
        logs: [
          {
            questionId: 101,
            questionContent: "Test",
            options: ["A", "B", "C"],
            correctAnswer: "A",
            userAnswer: "A",
            isCorrect: true,
            duration: 5000,
            tags: ["tag1"],
            source: "source",
            explanation: "exp",
            correctRatio: 0.8,
            mostWrongAnswer: null,
            reviewData: null,
            aiMnemonic: null,
            material: null,
            materialHtml: null,
          },
        ],
      });

      const result = await getSessionDetailAction("session-1");

      expect(result?.data?.session.accuracy).toBe(80);
      expect(result?.data?.logs).toHaveLength(1);
      expect(historyService.getSessionDetail).toHaveBeenCalledWith(
        1,
        "session-1",
      );
    });

    it("应该返回 null 当会话不存在", async () => {
      vi.mocked(historyService.getSessionDetail).mockResolvedValue(null);

      const result = await getSessionDetailAction("non-existent");

      expect(result?.data).toBeNull();
    });
  });

  // ========== deleteSessionAction 测试 ==========
  describe("deleteSessionAction", () => {
    it("应该成功删除会话", async () => {
      vi.mocked(historyService.deleteSession).mockResolvedValue(true);

      const result = await deleteSessionAction("session-1");

      expect(result?.data?.success).toBe(true);
      expect(historyService.deleteSession).toHaveBeenCalledWith(1, "session-1");
    });

    it("应该处理删除失败的情况", async () => {
      vi.mocked(historyService.deleteSession).mockResolvedValue(false);

      const result = await deleteSessionAction("session-1");

      expect(result?.data?.success).toBe(false);
    });
  });

  // ========== getAvailableModesAction 测试 ==========
  describe("getAvailableModesAction", () => {
    it("应该返回可用的练习模式列表", async () => {
      vi.mocked(historyService.getAvailableModes).mockResolvedValue([
        "normal",
        "review",
        "challenge",
      ]);

      const result = await getAvailableModesAction();

      expect(result?.data).toContain("normal");
      expect(result?.data).toContain("review");
      expect(historyService.getAvailableModes).toHaveBeenCalledWith(1);
    });

    it("应该返回空数组当没有模式", async () => {
      vi.mocked(historyService.getAvailableModes).mockResolvedValue([]);

      const result = await getAvailableModesAction();

      expect(result?.data).toEqual([]);
    });
  });

  // ========== renameSessionAction 测试 ==========
  describe("renameSessionAction", () => {
    it("应该成功重命名会话", async () => {
      vi.mocked(historyService.renameSession).mockResolvedValue(true);

      const result = await renameSessionAction({
        sessionId: "session-1",
        newName: "New Name",
      });

      expect(result?.data?.success).toBe(true);
      expect(historyService.renameSession).toHaveBeenCalledWith(
        1,
        "session-1",
        "New Name",
      );
    });

    it("应该处理重命名失败的情况", async () => {
      vi.mocked(historyService.renameSession).mockResolvedValue(false);

      const result = await renameSessionAction({
        sessionId: "session-1",
        newName: "New Name",
      });

      expect(result?.data?.success).toBe(false);
    });
  });

  // ========== exportSessionMarkdownAction 测试 ==========
  describe("exportSessionMarkdownAction", () => {
    it("应该成功导出 Markdown", async () => {
      vi.mocked(historyService.getSessionDetail).mockResolvedValue({
        session: {
          id: "session-1",
          sessionName: "Test Session",
          totalQuestions: 1,
          correctCount: 1,
          reviewCount: 0,
          createdAt: "2026-01-17T10:00:00Z",
          accuracy: 100,
          practiceMode: "normal",
        },
        logs: [],
      });
      vi.mocked(historyService.getAnalysisReport).mockResolvedValue(null);

      const result = await exportSessionMarkdownAction("session-1");

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.markdown).toContain("Test Session");
      expect(result?.data?.filename).toBeDefined();
    });

    it("应该处理会话不存在的情况", async () => {
      vi.mocked(historyService.getSessionDetail).mockResolvedValue(null);

      const result = await exportSessionMarkdownAction("non-existent");

      expect(result?.data?.success).toBe(false);
      expect(result?.data?.error).toContain("找不到");
    });
  });
});
