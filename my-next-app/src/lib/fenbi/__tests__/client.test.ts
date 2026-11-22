// @vitest-environment node
/**
 * 扫码接口的响应结构：`lgtoken` / `codeContent` 在 `data` 包裹层里。
 *
 * 线上 502 的真实根因就是这里误读顶层字段——正常响应被判为缺字段，
 * 抛 FenbiProtocolError 后被映射成 fenbi.upstream_unavailable / 502。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { FenbiProtocolError, genQrCode } from "../client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    }) as Response),
  );
}

describe("genQrCode", () => {
  it("读取 data.lgtoken / data.codeContent", async () => {
    stubFetch({
      code: 1,
      msg: "",
      data: {
        lgtoken: "tok-123",
        codeContent: "https://www.fenbi.com/depot/fenbi-scan-login/index.html?lgtoken=tok-123",
      },
    });

    await expect(genQrCode()).resolves.toEqual({
      lgtoken: "tok-123",
      qrContent:
        "https://www.fenbi.com/depot/fenbi-scan-login/index.html?lgtoken=tok-123",
    });
  });

  it("字段只在顶层时视为结构异常（不兼容错误的形状）", async () => {
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
