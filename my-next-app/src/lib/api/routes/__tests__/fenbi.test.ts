// @vitest-environment node
/**
 * 粉笔同步路由（`src/lib/api/routes/fenbi.ts`）的回归护栏。
 *
 * 这个文件里的用例对应三个真实故障，不要为了"通过"而放宽断言：
 * 1. `POST /qrcode` 走到 `FenbiProtocolError` 时必须回 502 **并且留一行日志**
 *    （线上只有 502 数字、看不到是"上游改版缺字段"还是"网络不通"就没法排查）；
 * 2. `GET /qrcode/status` 的 `linked` 是前端 `noCredential` 提示的契约源头：
 *    confirmed 无 cookie → `linked:false`；confirmed 有 cookie → `linked:true`；
 *    `canceled` / `failed` 两个取值必须原样透出，不能被吞成 `pending`；
 * 3. `lgtoken` 是必填查询参数，缺失时不得进入上游请求。
 *
 * 断言一律照 `fenbi.ts` 里 `createRoute` 声明的真实 body 结构写。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import app from "../fenbi";
import { FenbiNetworkError, FenbiProtocolError } from "@/lib/fenbi/client";
import { log } from "@/lib/logger";

const {
  mockGenQrCode,
  mockQueryQrStatus,
  mockFenbiLogin,
  mockLinkFenbiAccount,
  mockBuildQrDataUrl,
} = vi.hoisted(() => ({
  mockGenQrCode: vi.fn(),
  mockQueryQrStatus: vi.fn(),
  mockFenbiLogin: vi.fn(),
  mockLinkFenbiAccount: vi.fn(),
  mockBuildQrDataUrl: vi.fn(),
}));

// 错误类型保留真实实现（`instanceof` 判定要用同一个类），只桩掉发请求的三个函数
vi.mock("@/lib/fenbi/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fenbi/client")>()),
  genQrCode: mockGenQrCode,
  queryQrStatus: mockQueryQrStatus,
  fenbiLogin: mockFenbiLogin,
}));
vi.mock("@/lib/fenbi/sync", () => ({
  assertPhoneFormat: (phone: string) => phone,
  getFenbiStatus: vi.fn(),
  linkFenbiAccount: mockLinkFenbiAccount,
  syncFenbiForUser: vi.fn(),
  unlinkFenbiAccount: vi.fn(),
}));
vi.mock("@/lib/fenbi/qr-image", () => ({
  buildQrDataUrl: mockBuildQrDataUrl,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

const mockedWarn = vi.mocked(log.warn);

/** 取 `log.warn` 记过的所有消息（pino 垫片的第一参数就是消息字符串） */
function warnMessages(): string[] {
  return mockedWarn.mock.calls.map((call) => String(call[0]));
}

describe("Fenbi Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkFenbiAccount.mockResolvedValue(undefined);
  });

  describe("POST /qrcode", () => {
    it("上游返回缺少字段时回 502 fenbi.upstream_unavailable，并留下含错误类型的日志", async () => {
      // 线上真实故障：genQrCode 读错响应层级 → 抛协议错误
      mockGenQrCode.mockRejectedValue(
        new FenbiProtocolError("粉笔二维码接口返回缺少 lgtoken / codeContent"),
      );

      const res = await app.request("/qrcode", { method: "POST" });

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({
        error: "暂时无法连接粉笔，请稍后再试",
        code: "fenbi.upstream_unavailable",
      });

      // 这条钉住「502 必须留痕」：只有状态码的话线上分不清改版与断网
      expect(mockedWarn).toHaveBeenCalled();
      expect(
        warnMessages().some(
          (msg) =>
            msg.includes("FenbiProtocolError") && msg.includes("缺少 lgtoken"),
        ),
      ).toBe(true);
    });

    it("成功时回 lgtoken / qrContent / qrDataUrl 三段", async () => {
      mockGenQrCode.mockResolvedValue({
        lgtoken: "lt-1",
        qrContent: "https://ke.fenbi.com/qr/lt-1",
      });
      mockBuildQrDataUrl.mockResolvedValue("data:image/svg+xml;base64,AAA");

      const res = await app.request("/qrcode", { method: "POST" });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        lgtoken: "lt-1",
        qrContent: "https://ke.fenbi.com/qr/lt-1",
        qrDataUrl: "data:image/svg+xml;base64,AAA",
      });
    });
  });

  describe("GET /qrcode/status", () => {
    it("confirmed 但没有 cookie 时 linked=false（前端 noCredential 提示的依据）", async () => {
      mockQueryQrStatus.mockResolvedValue({ status: "confirmed", cookies: {} });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "confirmed",
        linked: false,
      });
      expect(mockLinkFenbiAccount).not.toHaveBeenCalled();
    });

    it("confirmed 且带 cookie 时落地 cookie 并回 linked=true", async () => {
      mockQueryQrStatus.mockResolvedValue({
        status: "confirmed",
        cookies: { sess: "x" },
      });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "confirmed",
        linked: true,
      });
      expect(mockLinkFenbiAccount).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ cookie: "sess=x" }),
      );
    });

    it("expired 时原样透出且 linked=false", async () => {
      mockQueryQrStatus.mockResolvedValue({ status: "expired", cookies: {} });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "expired",
        linked: false,
      });
    });

    it("canceled 时原样透出（不得被吞成 pending）", async () => {
      mockQueryQrStatus.mockResolvedValue({ status: "canceled", cookies: {} });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "canceled",
        linked: false,
      });
    });

    it("failed 时原样透出（不得被吞成 pending）", async () => {
      mockQueryQrStatus.mockResolvedValue({
        status: "failed",
        cookies: { sess: "x" },
      });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "failed",
        linked: false,
      });
      expect(mockLinkFenbiAccount).not.toHaveBeenCalled();
    });

    it("scanned 时 linked=false", async () => {
      mockQueryQrStatus.mockResolvedValue({ status: "scanned", cookies: {} });

      const res = await app.request("/qrcode/status?lgtoken=lt-1");

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        status: "scanned",
        linked: false,
      });
    });

    it("缺少 lgtoken 查询参数时不回 2xx，且不打上游请求", async () => {
      const res = await app.request("/qrcode/status");
      const body = await res.json();

      // 实测行为：zod-openapi 的默认校验错误（不是本仓库的 { error, code } 形态），
      // 状态码 400。这里按实际结果钉住，不写"期望中的形状"。
      expect(res.status).toBe(400);
      expect(res.ok).toBe(false);
      expect(body.success).toBe(false);
      expect(body.error.name).toBe("ZodError");
      expect(String(body.error.message)).toContain("lgtoken");
      expect(mockQueryQrStatus).not.toHaveBeenCalled();
    });
  });

  describe("错误映射不泄露上游原文", () => {
    it("FenbiNetworkError 也走同一条 502 分支", async () => {
      mockQueryQrStatus.mockRejectedValue(
        new FenbiNetworkError(
          "请求粉笔超时：https://ke.fenbi.com/qrcode-login/api/query_code_status",
        ),
      );

      const res = await app.request("/qrcode/status?lgtoken=lt-1");
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body).toEqual({
        error: "暂时无法连接粉笔，请稍后再试",
        code: "fenbi.upstream_unavailable",
      });
      // 对外只有中文文案 + 机器码：上游 URL 与原始异常不进响应体
      expect(JSON.stringify(body)).not.toContain("ke.fenbi.com");
    });
  });
});
