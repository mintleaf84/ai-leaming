// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 15000 });

const { mockAiClient, mockAiLib } = vi.hoisted(() => {
  return {
    mockAiClient: {
      getAiConfig: vi
        .fn()
        .mockReturnValue({
          apiKey: "default-key",
          baseURL: "https://api.example.com/v1",
          modelName: "gpt-4o-mini",
        }),
      getModel: vi.fn().mockReturnValue({ modelId: "mock-model" }),
    },
    mockAiLib: {
      generateText: vi.fn().mockResolvedValue({ text: "Pong" }),
    },
  };
});

vi.mock("@/lib/ai/client", () => mockAiClient);
vi.mock("ai", () => mockAiLib);
vi.mock("@/lib/db", () => ({
  default: { prepare: vi.fn(), exec: vi.fn() },
  db: { prepare: vi.fn(), exec: vi.fn() },
  drizzleDb: { prepare: vi.fn(), exec: vi.fn() },
  drizzleSchema: {},
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/auth/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, username: "admin" }),
  requireRole: vi.fn().mockResolvedValue({ id: 1, username: "admin" }),
}));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: vi.fn() }));

describe("Settings AI connection test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use the provided model name when testing connection", async () => {
    const { testAiConnectionAction } = await import("../config");

    const result = await testAiConnectionAction({
      apiKey: "test-key",
      apiUrl: "https://api.example.com/v1",
      modelName: "deepseek-chat",
    });

    expect(result.data?.success).toBe(true);
    expect(mockAiClient.getAiConfig).toHaveBeenCalledWith(
      "economy",
      "test-key",
      "https://api.example.com/v1",
    );
    expect(mockAiClient.getModel).toHaveBeenCalledWith(
      "default-key",
      "https://api.example.com/v1",
      "deepseek-chat",
    );
    expect(mockAiLib.generateText).toHaveBeenCalledTimes(1);
    expect(mockAiLib.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: "mock-model" },
        messages: [
          {
            role: "user",
            content: "Please respond with 'Pong' to verify the connection.",
          },
        ],
      }),
    );
  });
});
