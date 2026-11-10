// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../import";

const { mockImportFenbiDataAction } = vi.hoisted(() => ({
  mockImportFenbiDataAction: vi.fn(),
}));

vi.mock("@/server/actions/import", () => ({
  importFenbiDataAction: mockImportFenbiDataAction,
}));

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

function postImport() {
  return app.request("/fenbi-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validBody),
  });
}

describe("Import Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /fenbi-webhook", () => {
    it("action 抛错时透出真实原因（serverError）", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        serverError: "Database connection failed",
      });

      const res = await postImport();

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Database connection failed");
    });

    it("导入成功返回统计数据", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        data: {
          success: true,
          sessionId: "s1",
          importedCount: 10,
          newQuestionsCount: 8,
          skippedQuestionsCount: 2,
          duplicated: false,
          message: "成功导入 10 条作答记录",
        },
      });

      const res = await postImport();

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe("s1");
      expect(data.importedCount).toBe(10);
      expect(data.duplicated).toBe(false);
    });

    it("重复导入返回 duplicated=true 且不报错（脚本按成功处理）", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        data: {
          success: true,
          sessionId: "s1",
          importedCount: 0,
          newQuestionsCount: 0,
          skippedQuestionsCount: 20,
          duplicated: true,
          message: "该练习已导入过，本次跳过",
        },
      });

      const res = await postImport();

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.duplicated).toBe(true);
      expect(data.importedCount).toBe(0);
    });

    it("业务失败返回 success=false", async () => {
      mockImportFenbiDataAction.mockResolvedValue({
        data: {
          success: false,
          importedCount: 0,
          newQuestionsCount: 0,
          skippedQuestionsCount: 0,
          message: "Invalid JSON",
        },
      });

      const res = await postImport();

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Invalid JSON");
    });

    it("action 调用本身抛出异常时返回 500", async () => {
      mockImportFenbiDataAction.mockRejectedValue(new Error("Unexpected crash"));

      const res = await postImport();

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.message).toContain("Unexpected crash");
    });
  });
});
