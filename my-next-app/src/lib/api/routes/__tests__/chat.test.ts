// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../chat";

// Mock dependencies
const { mockChatService, mockQuota } = vi.hoisted(() => {
  return {
    mockChatService: {
      saveMessage: vi.fn(),
    },
    mockQuota: {
      checkQuotaForApi: vi.fn().mockReturnValue(null),
    },
  };
});

vi.mock("@/lib/services/chat", () => ({
  saveMessage: mockChatService.saveMessage,
}));
vi.mock("@/lib/billing/usage-middleware", () => ({
  checkQuotaForApi: mockQuota.checkQuotaForApi,
}));
vi.mock("@/lib/ai/client", () => ({
  streamChatWrapper: vi.fn().mockResolvedValue({
    toUIMessageStream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "start-step" });
          controller.enqueue({ type: "text-start", id: "t1" });
          controller.enqueue({
            type: "text-delta",
            id: "t1",
            delta: "ai response",
          });
          controller.enqueue({ type: "text-end", id: "t1" });
          controller.enqueue({ type: "finish-step" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      }),
  }),
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

describe("Chat Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /", () => {
    it("should return streaming response on success", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
          enableRag: false,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain('"type":"text-delta"');
      expect(text).toContain("ai response");
    });

    it("should return 429 when quota exceeded", async () => {
      mockQuota.checkQuotaForApi.mockReturnValue({ error: "Quota exceeded" });

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });

      expect(res.status).toBe(429);
    });
  });
});
