import { describe, it, expect, beforeEach, vi } from "vitest";

// 使用 vi.hoisted 确保 mock 对象在 vi.mock 之前可用
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  // 构造可链式调用的 Drizzle mock
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = [
      "insert",
      "values",
      "update",
      "set",
      "delete",
      "select",
      "from",
      "where",
      "innerJoin",
      "orderBy",
      "limit",
      "all",
      "get",
    ];
    methods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    return chain;
  };

  const chain = makeChain();

  const mockQuery = {
    chat_sessions: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockDrizzleDb = {
    ...chain,
    query: mockQuery,
    // 重新绑定，保证链式调用返回同一对象
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };

  const mockDrizzleSchema = {
    chat_sessions: {
      id: "id",
      user_id: "user_id",
      title: "title",
      updated_at: "updated_at",
      message_count: "message_count",
    },
    chat_messages: {
      id: "id",
      session_id: "session_id",
      role: "role",
      content: "content",
      is_favorite: "is_favorite",
      created_at: "created_at",
    },
  };

  return { mockDrizzleDb, mockDrizzleSchema };
});

// Mock @/lib/db，同时提供 default、drizzleDb、drizzleSchema 三个导出
vi.mock("@/lib/db", () => ({
  default: mockDrizzleDb,
  db: {},
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema,
}));

// 导入被测模块（必须在 mock 之后）
import {
  createSession,
  saveMessage,
  getSessionMessages,
  listSessions,
  deleteSession,
  updateSessionTitle,
  getSession,
  toggleMessageFavorite,
  getFavoriteMessages,
  searchMessages,
} from "@/lib/services/chat";

// ---- 辅助：获取链式 mock 中最终的 "叶子" 方法 ----
// Drizzle 的 .all() / .get() 是返回结果的终结方法
// 链对象上这两个方法需要在每个 it 中单独配置

describe("ChatService（Drizzle 版）", () => {
  const TEST_USER_ID = 1;

  // 从链对象中获取 all / get mock，方便单独配置返回值
  const chain = mockDrizzleDb as unknown as Record<
    string,
    ReturnType<typeof vi.fn>
  >;

  beforeEach(() => {
    vi.clearAllMocks();

    // 重新绑定链式调用：每个方法都返回 mockDrizzleDb 自身
    const chainMethods = [
      "values",
      "set",
      "from",
      "where",
      "innerJoin",
      "orderBy",
      "limit",
    ];
    chainMethods.forEach((m) => {
      chain[m].mockReturnValue(mockDrizzleDb);
    });
    // insert / update / delete / select 的直接返回也指向链
    mockDrizzleDb.insert.mockReturnValue(mockDrizzleDb);
    mockDrizzleDb.update.mockReturnValue(mockDrizzleDb);
    mockDrizzleDb.delete.mockReturnValue(mockDrizzleDb);
    mockDrizzleDb.select.mockReturnValue(mockDrizzleDb);

    // 默认 all / get 返回空
    chain["all"].mockResolvedValue([]);
    chain["get"].mockResolvedValue(undefined);
  });

  // ──────────────────────────────────────────
  // createSession
  // ──────────────────────────────────────────
  describe("createSession", () => {
    it("应该创建新会话并返回 ID", async () => {
      chain["values"].mockResolvedValueOnce({ lastInsertRowid: BigInt(42) });

      const id = await createSession(TEST_USER_ID, "新对话");

      expect(id).toBe(42);
      expect(mockDrizzleDb.insert).toHaveBeenCalled();
      expect(chain["values"]).toHaveBeenCalledWith({
        user_id: TEST_USER_ID,
        title: "新对话",
      });
    });

    it("应该使用默认标题", async () => {
      chain["values"].mockResolvedValueOnce({ lastInsertRowid: BigInt(1) });

      await createSession(TEST_USER_ID);

      expect(chain["values"]).toHaveBeenCalledWith({
        user_id: TEST_USER_ID,
        title: "新对话",
      });
    });
  });

  // ──────────────────────────────────────────
  // saveMessage
  // ──────────────────────────────────────────
  describe("saveMessage", () => {
    it("应该保存消息并返回消息 ID", async () => {
      // 权限检查：findFirst 返回存在的会话
      mockDrizzleDb.query.chat_sessions.findFirst.mockResolvedValueOnce({
        id: 1,
      });
      // 插入消息
      chain["values"].mockResolvedValueOnce({ lastInsertRowid: BigInt(100) });
      // 更新会话（where 作为链末尾，不需要特定返回值）

      const msgId = await saveMessage(TEST_USER_ID, 1, "user", "Hello");

      expect(msgId).toBe(100);
      expect(
        mockDrizzleDb.query.chat_sessions.findFirst,
      ).toHaveBeenCalledOnce();
      expect(mockDrizzleDb.insert).toHaveBeenCalled();
    });

    it("会话不存在时应该抛出错误", async () => {
      mockDrizzleDb.query.chat_sessions.findFirst.mockResolvedValueOnce(
        undefined,
      );

      await expect(
        saveMessage(TEST_USER_ID, 999, "user", "Hello"),
      ).rejects.toThrow("Unauthorized or session not found");
    });
  });

  // ──────────────────────────────────────────
  // getSessionMessages
  // ──────────────────────────────────────────
  describe("getSessionMessages", () => {
    it("应该返回会话的所有消息", async () => {
      const mockMessages = [
        {
          id: 1,
          session_id: 1,
          role: "user",
          content: "Hello",
          is_favorite: 0,
          created_at: "2024-01-01",
        },
        {
          id: 2,
          session_id: 1,
          role: "assistant",
          content: "Hi!",
          is_favorite: 0,
          created_at: "2024-01-01",
        },
      ];
      chain["all"].mockResolvedValueOnce(mockMessages);

      const messages = await getSessionMessages(TEST_USER_ID, 1);

      expect(messages).toEqual(mockMessages);
      expect(mockDrizzleDb.select).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // listSessions
  // ──────────────────────────────────────────
  describe("listSessions", () => {
    it("应该返回用户的会话列表", async () => {
      const mockSessions = [
        { id: 1, title: "会话1", message_count: 5 },
        { id: 2, title: "会话2", message_count: 3 },
      ];
      mockDrizzleDb.query.chat_sessions.findMany.mockResolvedValueOnce(
        mockSessions,
      );

      const sessions = await listSessions(TEST_USER_ID);

      expect(sessions).toEqual(mockSessions);
      expect(mockDrizzleDb.query.chat_sessions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it("应该支持自定义 limit", async () => {
      mockDrizzleDb.query.chat_sessions.findMany.mockResolvedValueOnce([]);

      await listSessions(TEST_USER_ID, 10);

      expect(mockDrizzleDb.query.chat_sessions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });
  });

  // ──────────────────────────────────────────
  // getSession
  // ──────────────────────────────────────────
  describe("getSession", () => {
    it("应该返回指定会话", async () => {
      const mockSession = { id: 1, title: "测试会话", message_count: 5 };
      mockDrizzleDb.query.chat_sessions.findFirst.mockResolvedValueOnce(
        mockSession,
      );

      const session = await getSession(TEST_USER_ID, 1);

      expect(session).toEqual(mockSession);
    });

    it("会话不存在时应该返回 null", async () => {
      mockDrizzleDb.query.chat_sessions.findFirst.mockResolvedValueOnce(
        undefined,
      );

      const session = await getSession(TEST_USER_ID, 999);

      expect(session).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // deleteSession
  // ──────────────────────────────────────────
  describe("deleteSession", () => {
    it("应该删除指定会话", async () => {
      // where 是链末尾，resolved undefined 即可
      chain["where"].mockResolvedValueOnce(undefined);

      await deleteSession(TEST_USER_ID, 1);

      expect(mockDrizzleDb.delete).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // updateSessionTitle
  // ──────────────────────────────────────────
  describe("updateSessionTitle", () => {
    it("应该更新会话标题", async () => {
      chain["where"].mockResolvedValueOnce(undefined);

      await updateSessionTitle(TEST_USER_ID, 1, "新标题");

      expect(mockDrizzleDb.update).toHaveBeenCalled();
      expect(chain["set"]).toHaveBeenCalledWith(
        expect.objectContaining({ title: "新标题" }),
      );
    });
  });

  // ──────────────────────────────────────────
  // toggleMessageFavorite
  // ──────────────────────────────────────────
  describe("toggleMessageFavorite", () => {
    it("应该设置消息收藏状态（收藏）", async () => {
      chain["where"].mockResolvedValueOnce(undefined);

      await toggleMessageFavorite(TEST_USER_ID, 1, true);

      expect(mockDrizzleDb.update).toHaveBeenCalled();
      expect(chain["set"]).toHaveBeenCalledWith({ is_favorite: 1 });
    });

    it("应该取消消息收藏", async () => {
      chain["where"].mockResolvedValueOnce(undefined);

      await toggleMessageFavorite(TEST_USER_ID, 1, false);

      expect(chain["set"]).toHaveBeenCalledWith({ is_favorite: 0 });
    });
  });

  // ──────────────────────────────────────────
  // getFavoriteMessages
  // ──────────────────────────────────────────
  describe("getFavoriteMessages", () => {
    it("应该返回用户收藏的消息", async () => {
      const mockFavorites = [
        {
          id: 1,
          content: "Favorite message",
          is_favorite: 1,
          role: "assistant",
          session_id: 1,
          created_at: "2024-01-01",
        },
      ];
      chain["all"].mockResolvedValueOnce(mockFavorites);

      const favorites = await getFavoriteMessages(TEST_USER_ID);

      expect(favorites).toEqual(mockFavorites);
      expect(mockDrizzleDb.select).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // searchMessages
  // ──────────────────────────────────────────
  describe("searchMessages", () => {
    it("应该搜索匹配的消息", async () => {
      const mockResults = [
        {
          messageId: 1,
          sessionId: 1,
          sessionTitle: "会话1",
          content: "包含关键词的消息",
          role: "user",
          created_at: "2024-01-01",
        },
      ];
      chain["all"].mockResolvedValueOnce(mockResults);

      const results = await searchMessages(TEST_USER_ID, "关键词");

      expect(results).toEqual(mockResults);
      expect(mockDrizzleDb.select).toHaveBeenCalled();
    });
  });
});
