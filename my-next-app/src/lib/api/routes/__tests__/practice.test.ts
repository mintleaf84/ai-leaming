// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../practice";

// Mock dependencies
const { mockPracticeService, mockImportService, InvalidQuestionIdsError } =
  vi.hoisted(() => {
    class InvalidQuestionIdsError extends Error {
      invalidQuestionIds: number[];
      constructor(ids: number[]) {
        super(`以下 questionId 不存在：${ids.join(", ")}`);
        this.name = "InvalidQuestionIdsError";
        this.invalidQuestionIds = ids;
      }
    }
    return {
      InvalidQuestionIdsError,
      mockPracticeService: {
        createRandomSession: vi.fn(),
        createTagSession: vi.fn(),
        createWrongSession: vi.fn(),
        submitAnswerWithValidation: vi.fn(),
        getSessionById: vi.fn(),
      },
      mockImportService: {
        importAgentAnswers: vi.fn(),
      },
    };
  });

vi.mock("@/lib/services/practice", () => ({
  practiceService: mockPracticeService,
}));

vi.mock("@/lib/services/import-service", () => ({
  importService: mockImportService,
  InvalidQuestionIdsError,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
  getCurrentUser: () => ({ id: 1 }),
}));

describe("Practice Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /session", () => {
    it("should create session", async () => {
      mockPracticeService.createRandomSession.mockResolvedValue({
        sessionId: "123",
        questions: [{ id: 1, content: "Q", options: [], type: "single" }],
      });
      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "random", limit: 10 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessionId).toBe("123");
      expect(data.questions).toHaveLength(1);
    });

    it("mode=tag 走 createTagSession 并透传 tag", async () => {
      mockPracticeService.createTagSession.mockResolvedValue({
        sessionId: "tag-1",
        questions: [{ id: 3, content: "Q", options: [], type: "single" }],
      });

      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tag", tag: "宪法", limit: 5 }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).sessionId).toBe("tag-1");
      expect(mockPracticeService.createTagSession).toHaveBeenCalledWith(
        1,
        "宪法",
        5,
      );
      expect(mockPracticeService.createRandomSession).not.toHaveBeenCalled();
    });

    it("mode=tag 缺 tag 参数时 400 且文案可读", async () => {
      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tag" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("tag");
      expect(mockPracticeService.createTagSession).not.toHaveBeenCalled();
    });

    it("mode=wrong 走 createWrongSession", async () => {
      mockPracticeService.createWrongSession.mockResolvedValue({
        sessionId: "wrong-2",
        questions: [{ id: 4, content: "Q", options: [], type: "single" }],
      });

      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "wrong", limit: 20 }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).sessionId).toBe("wrong-2");
      expect(mockPracticeService.createWrongSession).toHaveBeenCalledWith(
        1,
        20,
      );
    });

    it("无匹配题时回空 questions + 空 sessionId（不是 500）", async () => {
      mockPracticeService.createWrongSession.mockResolvedValue({
        sessionId: "",
        questions: [],
      });

      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "wrong" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessionId).toBe("");
      expect(data.questions).toEqual([]);
    });

    it("mode=first-principles 仍 400，文案为「暂未开放」", async () => {
      const res = await app.request("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "first-principles" }),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("暂未开放");
    });
  });

  describe("GET /session/:sessionId", () => {
    it("返回会话题目（错题本续练用）", async () => {
      mockPracticeService.getSessionById.mockResolvedValue({
        sessionId: "wrong-1",
        questions: [
          {
            id: 7,
            content: "题目",
            options: ["A", "B"],
            type: "single",
            material: null,
            material_html: null,
          },
        ],
        completedCount: 0,
        practiceMode: "review",
      });

      const res = await app.request("/session/wrong-1", { method: "GET" });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.sessionId).toBe("wrong-1");
      expect(data.questions).toHaveLength(1);
      expect(data.questions[0].id).toBe(7);
      expect(data.practiceMode).toBe("review");
      expect(mockPracticeService.getSessionById).toHaveBeenCalledWith(
        1,
        "wrong-1",
      );
    });

    it("会话不存在或不属于当前用户时返回 404", async () => {
      mockPracticeService.getSessionById.mockResolvedValue(null);

      const res = await app.request("/session/not-mine", { method: "GET" });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("练习会话不存在");
    });
  });

  describe("POST /offline-answers", () => {
    const body = {
      sessionKey: "local-session-uuid-1",
      answers: [{ questionId: 3, userAnswer: "A", isCorrect: true }],
    };

    it("离线答案按 sessionKey 幂等导入", async () => {
      mockImportService.importAgentAnswers.mockResolvedValue({
        sessionId: "agent_abc",
        inserted: 1,
        duplicated: false,
        regraded: 1,
      });

      const res = await app.request("/offline-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.inserted).toBe(1);
      expect(data.duplicated).toBe(false);
      // 客户端自报对错与服务端重判不一致的条数要透传给客户端
      expect(data.regraded).toBe(1);
      // 身份必须来自 JWT（userId=1），不能由请求体决定
      expect(mockImportService.importAgentAnswers).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sessionKey: "local-session-uuid-1" }),
      );
    });

    it("重复提交同一 sessionKey 返回 duplicated=true", async () => {
      mockImportService.importAgentAnswers.mockResolvedValue({
        sessionId: "agent_abc",
        inserted: 0,
        duplicated: true,
        regraded: 0,
      });

      const res = await app.request("/offline-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.duplicated).toBe(true);
      expect(data.regraded).toBe(0);
    });

    it("题目不存在时整批拒绝并回传前 5 个非法 id", async () => {
      mockImportService.importAgentAnswers.mockRejectedValue(
        new InvalidQuestionIdsError([101, 102]),
      );

      const res = await app.request("/offline-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.invalidQuestionIds).toEqual([101, 102]);
    });

    it("缺少 sessionKey 时 400（幂等键是必填）", async () => {
      const res = await app.request("/offline-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: body.answers }),
      });

      expect(res.status).toBe(400);
      expect(mockImportService.importAgentAnswers).not.toHaveBeenCalled();
    });
  });
});
