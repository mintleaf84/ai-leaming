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
      });

      const res = await app.request("/offline-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).duplicated).toBe(true);
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
