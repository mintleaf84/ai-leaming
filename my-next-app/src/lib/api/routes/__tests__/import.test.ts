// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../import";

// Mock dependencies
const { mockImportFenbiDataAction } = vi.hoisted(() => {
  return {
    mockImportFenbiDataAction: vi.fn(),
  };
});

vi.mock("@/server/actions/import", () => ({
  importFenbiDataAction: mockImportFenbiDataAction,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1 });
    await next();
  },
}));

const validBody = {
  exerciseJson: "{}",
  solutionsJson: "{}",
  statsJson: "",
};

describe("Import Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /fenbi-webhook", () => {
    it("should return 500 with real error message when action throws (serverError)", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        serverError: "Database connection failed",
      });

      const res = await app.request("/fenbi-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Database connection failed");
    });

    it("should return 200 with success data when import succeeds", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        data: {
          success: true,
          sessionId: "s1",
          importedCount: 10,
          newQuestionsCount: 8,
          skippedQuestionsCount: 2,
          message: "成功导入 10 条作答记录",
        },
      });

      const res = await app.request("/fenbi-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe("s1");
      expect(data.importedCount).toBe(10);
    });

    it("should return 200 with failure message when action returns business failure", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        data: {
          success: false,
          importedCount: 0,
          newQuestionsCount: 0,
          skippedQuestionsCount: 0,
          message: "Invalid JSON",
        },
      });

      const res = await app.request("/fenbi-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Invalid JSON");
    });

    it("should return 500 when action call itself throws", async () => {
      mockImportFenbiDataAction.mockRejectedValue(
        new Error("Unexpected crash"),
      );

      const res = await app.request("/fenbi-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.message).toContain("Unexpected crash");
    });
  });
});
