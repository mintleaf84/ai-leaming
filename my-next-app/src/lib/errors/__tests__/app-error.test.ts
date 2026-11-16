// @vitest-environment node
/**
 * 错误分类 + 唯一映射点。
 *
 * 这个文件守的是「状态码来自类型，不来自文案匹配」这条约定：
 * 文案随便改，状态码不该跟着漂。
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  AppError,
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "../app-error";
import { toErrorResponse } from "../../api/error-response";

function render(error: unknown, maxIssues?: number) {
  const app = new Hono();
  app.get("/x", (c) => toErrorResponse(c, error, { maxIssues, scope: "test" }));
  return app.request("/x");
}

describe("AppError 分类", () => {
  it.each([
    [new ValidationError("bad"), 400],
    [new BusinessError("nope"), 400],
    [new NotFoundError("gone"), 404],
    [new ConflictError("dup"), 409],
    [new ForbiddenError("no"), 403],
  ])("%s → %i", async (error, status) => {
    expect(error.status).toBe(status);
    const res = await render(error);
    expect(res.status).toBe(status);
  });

  it("domain 类继承后 state 码由类型决定，改文案不影响状态码", async () => {
    class RecallThing extends NotFoundError {}
    const res = await render(new RecallThing("文案随便改"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "文案随便改" });
  });

  it("isAppError 只认 AppError 家族", () => {
    expect(isAppError(new NotFoundError("x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("toErrorResponse（唯一映射点）", () => {
  it("校验错误：对外短文案 + 明细 + 总数，且默认截断到 20 条", async () => {
    const issues = Array.from({ length: 35 }, (_, i) => `cards[${i}]: bad`);
    const res = await render(
      new ValidationError("内部长文案不该直接给用户", {
        code: "recall.deck.invalid",
        issues,
        publicMessage: "卡组内容校验失败",
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      code: string;
      issues: string[];
      issueCount: number;
    };
    expect(body.error).toBe("卡组内容校验失败");
    expect(body.code).toBe("recall.deck.invalid");
    expect(body.issues).toHaveLength(20);
    expect(body.issueCount).toBe(35);
  });

  it("截断条数可覆盖（外部 API 卡组可能上百张）", async () => {
    const issues = Array.from({ length: 50 }, (_, i) => `c${i}`);
    const res = await render(new ValidationError("x", { issues }), 5);
    const body = (await res.json()) as { issues: string[]; issueCount: number };
    expect(body.issues).toHaveLength(5);
    expect(body.issueCount).toBe(50);
  });

  it("未归类的异常一律 500 + 通用文案，不把内部信息漏给调用方", async () => {
    const res = await render(
      new Error("SQLITE_BUSY: 数据库路径 /app/data/x.db"),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "服务器内部错误",
      code: "internal",
    });
  });

  it("AppError 默认带 code（由 kind 兜底），便于客户端分支", async () => {
    const res = await render(new ConflictError("已存在"));
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("conflict");
  });

  it("自定义 AppError kind 也走同一张映射表", async () => {
    const res = await render(new AppError("forbidden", "别碰"));
    expect(res.status).toBe(403);
  });
});
