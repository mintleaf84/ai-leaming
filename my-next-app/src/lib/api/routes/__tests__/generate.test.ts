// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../generate";

// Mock dependencies
const { mockAiLib } = vi.hoisted(() => {
  return {
    mockAiLib: {
      streamText: vi.fn().mockReturnValue({
        toTextStreamResponse: () => new Response("generated content"),
      }),
    },
  };
});

vi.mock("ai", () => ({ streamText: mockAiLib.streamText }));
vi.mock("@/lib/ai/client", () => ({
  getAiConfig: vi
    .fn()
    .mockReturnValue({ apiKey: "key", baseURL: "base", modelName: "m" }),
  getModel: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/billing/subscription-service", () => ({
  checkAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

describe("Generate Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /", () => {
    it("should return streaming response for writing assistant", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "test",
          option: "improve",
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("generated content");
    });
  });
});
