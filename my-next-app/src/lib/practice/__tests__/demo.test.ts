// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DemoService } from "../demo";
import { createMockQuery } from "@/lib/__tests__/db-mock-utils";

const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const mockDrizzleDb = {
    select: vi.fn(() => createMockQuery([])),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    update: vi
      .fn()
      .mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
      }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
    query: {
      system_settings: { findFirst: vi.fn() },
      practice_sessions: { findFirst: vi.fn() },
    },
  };

  return {
    mockDrizzleDb,
    mockDrizzleSchema: {
      system_settings: {
        key: "system_settings.key",
        value: "system_settings.value",
      },
      practice_sessions: {
        id: "practice_sessions.id",
        user_id: "practice_sessions.user_id",
        is_demo: "practice_sessions.is_demo",
        created_at: "practice_sessions.created_at",
        correct_count: "practice_sessions.correct_count",
        questions_json: "practice_sessions.questions_json",
      },
      practice_logs: {
        id: "practice_logs.id",
        session_id: "practice_logs.session_id",
      },
      questions: {
        id: "questions.id",
        type: "questions.type",
        options: "questions.options",
        tags: "questions.tags",
        dimension: "questions.dimension",
        content: "questions.content",
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema,
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("DemoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isDemoModeEnabled", () => {
    it("应该返回 true 当 demo_mode_enabled 设置为 true", async () => {
      mockDrizzleDb.query.system_settings.findFirst.mockResolvedValue({
        key: "demo_mode_enabled",
        value: "true",
      });

      const result = await DemoService.isDemoModeEnabled();
      expect(result).toBe(true);
    });

    it("应该返回 false 当 demo_mode_enabled 设置为 false", async () => {
      mockDrizzleDb.query.system_settings.findFirst.mockResolvedValue({
        key: "demo_mode_enabled",
        value: "false",
      });

      const result = await DemoService.isDemoModeEnabled();
      expect(result).toBe(false);
    });

    it("应该返回 false 当没有找到设置", async () => {
      mockDrizzleDb.query.system_settings.findFirst.mockResolvedValue(null);

      const result = await DemoService.isDemoModeEnabled();
      expect(result).toBe(false);
    });

    it("应该返回 false 当查询抛出异常", async () => {
      mockDrizzleDb.query.system_settings.findFirst.mockRejectedValue(
        new Error("DB Error"),
      );

      const result = await DemoService.isDemoModeEnabled();
      expect(result).toBe(false);
    });
  });

  describe("getDemoSession", () => {
    const userId = 1;

    it("应该返回 null 当没有可用题目", async () => {
      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(null);
      mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

      const result = await DemoService.getDemoSession(userId);
      expect(result).toBeNull();
    });

    it("应该返回已存在的演示会话题目", async () => {
      const mockSession = {
        id: "demo-session-123",
        user_id: userId,
        is_demo: 1,
        questions_json: JSON.stringify([
          {
            id: 1,
            content: "Question 1",
            options: ["A", "B"],
            tags: ["tag1"],
            type: "single",
          },
        ]),
        correct_count: 0,
      };

      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(
        mockSession,
      );
      mockDrizzleDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });
      mockDrizzleDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      });

      const result = await DemoService.getDemoSession(userId);

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe("demo-session-123");
      expect(result?.questions).toHaveLength(1);
    });

    it("应该创建新会话并返回题目", async () => {
      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(null);

      const mockQuestions = [
        {
          id: 1,
          content: "Q1",
          options: '["A","B"]',
          tags: '["tag1"]',
          type: "single",
          dimension: "knowledge",
        },
        {
          id: 2,
          content: "Q2",
          options: '["A","B"]',
          tags: '["tag2"]',
          type: "single",
          dimension: "knowledge",
        },
      ];

      mockDrizzleDb.select.mockReturnValue(createMockQuery(mockQuestions));

      mockDrizzleDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      });

      const result = await DemoService.getDemoSession(userId);

      expect(result).not.toBeNull();
      expect(result?.questions).toHaveLength(2);
      expect(mockDrizzleDb.insert).toHaveBeenCalled();
    });

    it("应该在解析 questions_json 失败时返回 null", async () => {
      const mockSession = {
        id: "demo-session-123",
        user_id: userId,
        is_demo: 1,
        questions_json: "invalid json",
        correct_count: 0,
      };

      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(
        mockSession,
      );
      mockDrizzleDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });
      mockDrizzleDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      });

      const result = await DemoService.getDemoSession(userId);
      expect(result).toBeNull();
    });

    it("应该处理空题目 JSON 数组", async () => {
      const mockSession = {
        id: "demo-session-empty",
        user_id: userId,
        is_demo: 1,
        questions_json: "[]",
        correct_count: 0,
      };

      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(
        mockSession,
      );
      mockDrizzleDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });

      const result = await DemoService.getDemoSession(userId);
      expect(result?.questions).toEqual([]);
    });
  });
});
