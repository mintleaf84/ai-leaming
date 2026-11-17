// @vitest-environment node
/**
 * chat 路由会话管理端点（GET/POST /sessions、GET/DELETE /sessions/:id）。
 * mock 范式沿用 practice.test.ts：mock service 层与 authMiddleware，
 * 只验证路由层的参数解析、字段名契约（Flutter 端消费字段）与归属 404。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../chat";

const { mockChatService } = vi.hoisted(() => {
  return {
    mockChatService: {
      listSessions: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn(),
      getSessionMessages: vi.fn(),
      deleteSession: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/chat", () => ({
  saveMessage: vi.fn(),
  listSessions: mockChatService.listSessions,
  createSession: mockChatService.createSession,
  getSession: mockChatService.getSession,
  getSessionMessages: mockChatService.getSessionMessages,
  deleteSession: mockChatService.deleteSession,
}));

// chat.ts 顶层还 import 了这些，未 mock 会触发真实模块加载（连带 DB/ai sdk）
vi.mock("@/lib/ai/client", () => ({
  streamChatWrapper: vi.fn(),
}));
vi.mock("@/lib/services/chat-rag", () => ({
  buildEnhancedSystemPrompt: vi.fn(),
  parseCommand: vi.fn(() => ({ type: "none", keyword: "" })),
  handleQuizCommand: vi.fn(),
  handleExplainCommand: vi.fn(),
}));
vi.mock("@/lib/billing/usage-middleware", () => ({
  checkQuotaForApi: vi.fn().mockResolvedValue(null),
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
  getCurrentUser: () => ({ id: 1 }),
}));

describe("Chat sessions routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /sessions", () => {
    it("返回 data.sessions 数组（Flutter 会话列表消费字段）", async () => {
      mockChatService.listSessions.mockResolvedValue([
        {
          id: 11,
          title: "第一课",
          created_at: "2026-01-01 00:00:00",
          updated_at: "2026-01-02 10:00:00",
          message_count: 3,
        },
      ]);

      const res = await app.request("/sessions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions[0].id).toBe(11);
      expect(data.sessions[0].title).toBe("第一课");
      expect(data.sessions[0].updated_at).toBe("2026-01-02 10:00:00");
      expect(mockChatService.listSessions).toHaveBeenCalledWith(1, 20);
    });
  });

  describe("POST /sessions", () => {
    it("新建会话返回 data.sessionId", async () => {
      mockChatService.createSession.mockResolvedValue(42);

      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessionId).toBe(42);
      expect(mockChatService.createSession).toHaveBeenCalledWith(1, undefined);
    });

    it("支持自定义标题", async () => {
      mockChatService.createSession.mockResolvedValue(43);

      await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "错题讨论" }),
      });
      expect(mockChatService.createSession).toHaveBeenCalledWith(1, "错题讨论");
    });
  });

  describe("GET /sessions/:id", () => {
    it("返回 session 与 messages", async () => {
      mockChatService.getSession.mockResolvedValue({
        id: 11,
        title: "第一课",
        created_at: "2026-01-01 00:00:00",
        updated_at: "2026-01-02 10:00:00",
        message_count: 1,
      });
      mockChatService.getSessionMessages.mockResolvedValue([
        {
          id: 100,
          session_id: 11,
          role: "user",
          content: "什么是力？",
          is_favorite: 0,
          created_at: "2026-01-02 09:00:00",
        },
      ]);

      const res = await app.request("/sessions/11");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.id).toBe(11);
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].role).toBe("user");
      expect(data.messages[0].content).toBe("什么是力？");
      expect(data.messages[0].is_favorite).toBe(0);
    });

    it("他人会话返回 404（归属过滤）", async () => {
      mockChatService.getSession.mockResolvedValue(null);

      const res = await app.request("/sessions/999");
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("会话不存在");
      expect(mockChatService.getSessionMessages).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("删除自己的会话返回 success", async () => {
      mockChatService.getSession.mockResolvedValue({
        id: 11,
        title: "第一课",
        created_at: "2026-01-01 00:00:00",
        updated_at: "2026-01-02 10:00:00",
        message_count: 0,
      });
      mockChatService.deleteSession.mockResolvedValue(undefined);

      const res = await app.request("/sessions/11", { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockChatService.deleteSession).toHaveBeenCalledWith(1, 11);
    });

    it("他人会话删除返回 404", async () => {
      mockChatService.getSession.mockResolvedValue(null);

      const res = await app.request("/sessions/999", { method: "DELETE" });
      expect(res.status).toBe(404);
      expect(mockChatService.deleteSession).not.toHaveBeenCalled();
    });
  });
});
