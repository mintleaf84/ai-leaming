// @vitest-environment node
/**
 * 扫码两个接口的响应契约。
 *
 * `gen_code`：字段在 `data` 包裹层里。线上 502 的真实根因就是误读顶层字段——
 * 正常响应被判为缺字段，抛 FenbiProtocolError 后被映射成 fenbi.upstream_unavailable。
 *
 * `query_code_status`：`data` 是状态数字，语义见 client.ts 的 QR_STATUS_BY_CODE
 * （取自粉笔 PC 端登录组件自带的枚举）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FenbiProtocolError, genQrCode, queryQrStatus } from "../client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(payload),
        }) as Response,
    ),
  );
}

/** 状态接口：响应体只有一个数字，登录凭证走 Set-Cookie 头。 */
function stubStatus(payload: unknown, setCookies: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(payload),
          headers: {
            getSetCookie: () => setCookies,
            get: (name: string) =>
              name.toLowerCase() === "set-cookie"
                ? (setCookies[0] ?? null)
                : null,
          },
        }) as Response,
    ),
  );
}

describe("genQrCode", () => {
  it("读取实测响应（脱敏 fixture 的 data.lgtoken / data.codeContent）", async () => {
    const fixture = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "fixtures/gen_code.response.json"),
        "utf8",
      ),
    ) as { data: { lgtoken: string; codeContent: string } };

    stubFetch(fixture);
    await expect(genQrCode()).resolves.toEqual({
      lgtoken: fixture.data.lgtoken,
      qrContent: fixture.data.codeContent,
    });
  });

  // 设计文档早期版本记成顶层字段；2026-11-22 实测（服务端容器内 + 本地 curl）
  // 确认只有 data 包裹层。这个用例固定「不再兼容旧的顶层假设」，防止把 502 引回来。
  it("字段只在顶层时视为结构异常（不兼容已废弃的旧假设）", async () => {
    stubFetch({
      code: 1,
      lgtoken: "tok-123",
      codeContent: "https://www.fenbi.com/scan?lgtoken=tok-123",
    });

    await expect(genQrCode()).rejects.toBeInstanceOf(FenbiProtocolError);
  });

  it("data 缺少 codeContent 时也报结构异常", async () => {
    stubFetch({ code: 1, data: { lgtoken: "tok-123" } });

    await expect(genQrCode()).rejects.toThrow(/缺少 lgtoken/);
  });
});

describe("queryQrStatus", () => {
  it.each([
    [1, "pending"],
    [2, "scanned"],
    [3, "confirmed"],
    [4, "canceled"],
    [5, "failed"],
  ])("data=%i → %s", async (data, expected) => {
    stubStatus({ code: 1, msg: "", data });
    await expect(queryQrStatus("tok")).resolves.toMatchObject({
      status: expected,
    });
  });

  // 回归钉子：真实失效码是 0（本机 curl 实测，二维码约 100 秒后变成
  // {"code":1,"msg":"二维码已失效","data":0}）。它曾被落进 default 当成
  // 「还在等扫码」，于是用户在手机上点确认时码早已过期，界面上却毫无提示。
  it("data=0 是已失效，不是 pending", async () => {
    stubStatus({ code: 1, msg: "二维码已失效", data: 0 });
    await expect(queryQrStatus("tok")).resolves.toMatchObject({
      status: "expired",
    });
  });

  it("未登记的取值按 pending 兜底，不谎报成功", async () => {
    stubStatus({ code: 1, msg: "", data: 99 });
    await expect(queryQrStatus("tok")).resolves.toMatchObject({
      status: "pending",
    });
  });

  it("确认成功时把 Set-Cookie 解析成 cookie jar", async () => {
    stubStatus({ code: 1, msg: "", data: 3 }, [
      "sess=abc123; Path=/; HttpOnly",
      "userid=42; Path=/",
    ]);

    const result = await queryQrStatus("tok");
    expect(result.status).toBe("confirmed");
    expect(result.cookies).toEqual({ sess: "abc123", userid: "42" });
  });
});
