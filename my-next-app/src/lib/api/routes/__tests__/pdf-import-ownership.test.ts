// @vitest-environment node
/**
 * PDF 导入路由的归属校验（IDOR 防护）——路由层只验「服务层的归属错误被映射成 404」，
 * 真实的归属逻辑在 `src/lib/services/__tests__/pdf-import.test.ts` 里用真实服务测。
 *
 * 背景：这四个端点原先只要求登录，取到 user 后不做任何归属校验。taskId 虽然是
 * 不易猜的 UUID，但拿到它就能读走别人 PDF 的 OCR 文本、或删掉别人的任务。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../pdf-import";
import { PdfImportTaskNotFoundError } from "@/lib/services/pdf-import";

/** 当前请求的调用者：每个用例自己设，模拟不同用户 */
const holder = vi.hoisted(() => ({ userId: 1 }));

const { mockService } = vi.hoisted(() => ({
  mockService: {
    ocrAndSplit: vi.fn(),
    splitText: vi.fn(),
    parseSingleChunk: vi.fn(),
    cleanup: vi.fn(),
    confirmImport: vi.fn(),
  },
}));

vi.mock("@/lib/services/pdf-import", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/pdf-import")
  >("@/lib/services/pdf-import");
  // 顺序要紧：先展开真实模块（拿到 PdfImportTaskNotFoundError 等类），
  // 再覆盖 pdfImportService，否则会被真实实现覆盖回 mock 失效
  return { ...actual, pdfImportService: mockService };
});

vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("user", { id: holder.userId });
    await next();
  },
  getCurrentUser: () => ({ id: holder.userId }),
}));

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PDF 导入路由 · 归属校验", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.userId = 1;
  });

  it("parse-chunk：他人的 taskId 映射为 404，且不泄露「任务存在」", async () => {
    holder.userId = 2;
    mockService.parseSingleChunk.mockRejectedValue(
      new PdfImportTaskNotFoundError(),
    );

    const res = await post("/parse-chunk", { taskId: "t-1", chunkIndex: 0 });

    expect(res.status).toBe(404);
    // 统一映射点会附上机器可读的 code（状态码来自 AppError.kind，不靠文案匹配）
    await expect(res.json()).resolves.toMatchObject({
      error: "任务不存在或已过期，请重新上传",
      code: "pdf-import.task.not-found",
    });
  });

  it("parse-chunk：把当前用户与 taskId 一起交给服务层（不传调用方 userId 就会被绕过）", async () => {
    holder.userId = 7;
    mockService.parseSingleChunk.mockResolvedValue({
      questions: [],
      chunkIndex: 0,
      warnings: [],
    });

    await post("/parse-chunk", { taskId: "t-2", chunkIndex: 0 });

    expect(mockService.parseSingleChunk).toHaveBeenCalledWith(7, "t-2", 0);
  });

  it("parse-chunk：普通失败仍是 500（不要把业务错误都吞成 404）", async () => {
    mockService.parseSingleChunk.mockRejectedValue(new Error("AI 服务不可用"));

    const res = await post("/parse-chunk", { taskId: "t-3", chunkIndex: 0 });

    expect(res.status).toBe(500);
  });

  it("cleanup：按「当前用户 + taskId」清理，删不到时返回 ok=false（仍是 200，幂等）", async () => {
    holder.userId = 3;
    mockService.cleanup.mockReturnValue(false);

    const res = await post("/cleanup", { taskId: "t-4" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: false });
    expect(mockService.cleanup).toHaveBeenCalledWith(3, "t-4");
  });

  it("text-import：创建任务时带上当前用户（缓存条目必须带 owner）", async () => {
    holder.userId = 5;
    mockService.splitText.mockResolvedValue({ taskId: "t-5", totalChunks: 2 });

    const res = await post("/text-import", {
      text: "1. 教育学研究的基本方法是观察法。2. 另一道题的题干也要够长。",
    });

    expect(res.status).toBe(200);
    expect(mockService.splitText).toHaveBeenCalledWith(
      5,
      expect.stringContaining("教育学研究"),
    );
  });
});
