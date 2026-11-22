// @vitest-environment node
/**
 * 扫码接口的响应结构：`lgtoken` / `codeContent` 在 `data` 包裹层里。
 *
 * 线上 502 的真实根因就是这里误读顶层字段——正常响应被判为缺字段，
 * 抛 FenbiProtocolError 后被映射成 fenbi.upstream_unavailable / 502。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FenbiProtocolError, genQrCode } from "../client";

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
