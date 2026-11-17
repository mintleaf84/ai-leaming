/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 批次 B5：OCR 上传区原本是 `div onClick`（点整块 = 打开文件选择器）。
 * 处置（第 1 类）：换成真 `<button>`，隐藏的 file input 移出到兄弟节点
 * （button 里不能嵌套交互元素）。拖拽是附加路径，仍挂在同一元素上。
 */

vi.mock("@/server/actions/ocr", () => ({
  performOcrAction: vi.fn(),
  getOcrModelsAction: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@/server/actions/mindmap", () => ({
  generateMindmapAction: vi.fn(),
}));

vi.mock("@/server/actions/feature-flags", () => ({
  getGlobalFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import OcrPage from "../page";

describe("OCR 上传区键盘可达（批次 B5）", () => {
  beforeEach(() => {
    // jsdom 没有文件选择器：拦掉原生 click（原生实现会抛/无效果）
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  });

  it("上传区是真按钮：Tab 能到，Enter / Space 各打开一次文件选择器", async () => {
    const user = userEvent.setup();
    const { container } = render(<OcrPage />);

    const dropzone = await screen.findByRole("button", {
      name: /拖拽文件到这里/,
    });
    expect(dropzone.tagName).toBe("BUTTON");
    expect(dropzone).toHaveAttribute("type", "button");

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    // 结构：input 不能嵌在 button 里（交互元素不可互相嵌套）
    expect(dropzone.contains(input)).toBe(false);

    const clickSpy = vi.spyOn(input!, "click");

    // Tab 能到：页面上排在它前面的可聚焦控件只有模型选择器
    let reached = false;
    for (let i = 0; i < 5 && !reached; i += 1) {
      await user.tab();
      reached = document.activeElement === dropzone;
    }
    expect(reached).toBe(true);

    await user.keyboard("{Enter}");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("点击上传区仍是同一行为（鼠标路径不变）", async () => {
    const user = userEvent.setup();
    const { container } = render(<OcrPage />);

    const dropzone = await screen.findByRole("button", {
      name: /拖拽文件到这里/,
    });
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const clickSpy = vi.spyOn(input, "click");
    clickSpy.mockClear();

    await user.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
