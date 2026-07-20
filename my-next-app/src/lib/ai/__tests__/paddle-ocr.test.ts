import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/env — vi.hoisted 确保在 vi.mock 提升时变量已可用
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    PADDLE_OCR_TOKEN: "test-token",
  } as Record<string, unknown>,
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { performPaddleOCR } from "../paddle-ocr";

describe("performPaddleOCR", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.PADDLE_OCR_TOKEN = "test-token";
  });

  it("应该正确调用 API 并解析返回的 Markdown", async () => {
    const mockResponse = {
      result: {
        layoutParsingResults: [
          {
            markdown: { text: "# 页面 1 内容" },
          },
          {
            markdown: { text: "页面 2 内容" },
          },
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await performPaddleOCR(
      Buffer.from("test"),
      "test.png",
      "image/png",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("layout-parsing"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token test-token",
        }),
      }),
    );

    expect(result).toContain("# 页面 1 内容");
    expect(result).toContain("页面 2 内容");
  });

  it("如果 API 返回错误应该抛出异常", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    } as Response);

    await expect(
      performPaddleOCR(Buffer.from("test"), "test.png", "image/png"),
    ).rejects.toThrow("PaddleOCR 识别失败: 403");
  });

  it("如果缺少 TOKEN 应该抛出异常", async () => {
    mockEnv.PADDLE_OCR_TOKEN = undefined;
    await expect(
      performPaddleOCR(Buffer.from("test"), "test.png", "image/png"),
    ).rejects.toThrow("缺少 PADDLE_OCR_TOKEN");
  });

  it("应该清理返回的 Markdown 中的图片和 HTML 标签", async () => {
    const mockResponse = {
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: '文本 ![图片描述](temp_url.png) 更多文本 <img src="xxx"> <div class="empty"></div>',
            },
          },
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await performPaddleOCR(
      Buffer.from("test"),
      "test.png",
      "image/png",
    );

    expect(result).toBe("文本  更多文本");
  });
});
