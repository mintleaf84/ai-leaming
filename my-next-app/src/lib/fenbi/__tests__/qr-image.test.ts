// @vitest-environment node
/**
 * 二维码渲染：服务端把登录二维码渲染成内联 data URL。
 *
 * 守的是两条曾经出过问题的事：
 * 1. **不依赖任何外部图片服务**——旧实现拼 `api.qrserver.com`，受限网络下
 *    界面就是一块空白（真实故障）；这里断言输出是自包含的 data URL。
 * 2. 内容是二维码而不是一段占位文本：base64 解开必须是 `<svg`，且包含
 *    `path`/`rect` 这些真实码图元素。
 */
import { describe, it, expect } from "vitest";

import { buildQrDataUrl, QR_IMAGE_SIZE } from "../qr-image";

function decode(dataUrl: string): string {
  const prefix = "data:image/svg+xml;base64,";
  expect(dataUrl.startsWith(prefix)).toBe(true);
  return Buffer.from(dataUrl.slice(prefix.length), "base64").toString("utf8");
}

describe("buildQrDataUrl", () => {
  it("返回自包含的 SVG data URL，且不引用任何外部域名", async () => {
    const dataUrl = await buildQrDataUrl(
      "https://fenbi.example.com/s?t=abc123",
    );

    expect(dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(dataUrl).not.toContain("qrserver");
    expect(dataUrl).not.toContain("http");

    const svg = decode(dataUrl);
    expect(svg).toContain("<svg");
    expect(svg).toContain(`width="${QR_IMAGE_SIZE}"`);
    // 至少有一个真实码图元素，而不是空壳
    expect(/<(path|rect)/.test(svg)).toBe(true);
  });

  it("同一内容两次渲染逐字节一致（可缓存、可比对）", async () => {
    const a = await buildQrDataUrl("https://fenbi.example.com/s?t=abc123");
    const b = await buildQrDataUrl("https://fenbi.example.com/s?t=abc123");
    expect(a).toBe(b);
  });

  it("内容不同 → 码图不同（不是把内容当占位图返回）", async () => {
    const a = await buildQrDataUrl("https://fenbi.example.com/s?t=aaa");
    const b = await buildQrDataUrl("https://fenbi.example.com/s?t=bbb");
    expect(a).not.toBe(b);
  });

  it("超长/含中文的二维码内容也能渲染（粉笔的 codeContent 可能带参数）", async () => {
    const text = `https://fenbi.example.com/s?t=${"x".repeat(200)}&note=${encodeURIComponent("教师招聘")}`;
    const svg = decode(await buildQrDataUrl(text));
    expect(svg).toContain("<svg");
  });
});
