/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 批次 B5：可标注文本的划词工具条。
 *
 * 处置：
 *  - 标注片段（点击删除）in-place span → 真 `<button>`（第 1 类，键盘可 Tab/Enter）
 *  - 文本容器上的 `onMouseUp` 挪到 document（第 2 类：选区完成事件既可能发生在容器外松手，
 *    也可能是键盘 Shift+方向键——原来是鼠标专属）
 *  - 工具条是复合控件：`role="toolbar"`，键盘选区建立后焦点进入工具条，Esc 只收工具条
 */

const deleteSpy = vi.fn();
const postSpy = vi.fn();

vi.mock("@/lib/utils/api-client", () => ({
  fetchJson: vi.fn().mockResolvedValue({ annotations: [] }),
  apiClient: {
    post: (...args: unknown[]) => postSpy(...args),
    delete: (...args: unknown[]) => deleteSpy(...args),
  },
}));

import { fetchJson } from "@/lib/utils/api-client";
import { AnnotatableText } from "../AnnotatableText";

const TEXT = "这是一段可标注的题干文本。";

function renderAnnotatable(annotations: unknown[] = []) {
  (fetchJson as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    annotations,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <AnnotatableText text={TEXT} questionId={1} />
    </QueryClientProvider>,
  );
  return utils;
}

/** 用键盘方式建立一个 0-4 的选区，并派发选择类按键 */
function selectWithKeyboard(container: HTMLElement) {
  const textContainer = container.querySelector(".select-text")!;
  const textNode = textContainer.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 4);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.keyUp(document, { key: "ArrowRight", shiftKey: true });
}

describe("AnnotatableText 键盘路径（批次 B5）", () => {
  beforeEach(() => {
    deleteSpy.mockClear();
    postSpy.mockClear();
    // jsdom 的 Range 没有 getBoundingClientRect：工具条定位需要它
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        right: 50,
        bottom: 30,
        width: 40,
        height: 10,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });
  });

  it("键盘建立选区后工具条出现，并接收焦点（Tab 才能接着走）", async () => {
    const { container } = renderAnnotatable();

    selectWithKeyboard(container);

    const toolbar = await screen.findByRole("toolbar", { name: "标注工具" });
    expect(toolbar).toBeInTheDocument();

    const firstAction = screen.getByRole("button", { name: "高亮" });
    await waitFor(() => expect(document.activeElement).toBe(firstAction));
  });

  it("工具条内 Tab 可遍历三个标注动作；Esc 只收工具条（不冒泡到上层浮层）", async () => {
    const user = userEvent.setup();
    const { container } = renderAnnotatable();

    // 上层详情浮层（Radix Dialog）也监听 document 上的 Esc：这里用一个 document
    // 监听器代表它，验证工具条会 stopPropagation
    const outerEsc = vi.fn();
    document.addEventListener("keydown", outerEsc);

    selectWithKeyboard(container);
    await screen.findByRole("toolbar", { name: "标注工具" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "高亮" }),
      ),
    );

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "下划线" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "波浪线" }),
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    // 工具条消费了这次 Esc：上层浮层（document 级监听）不该跟着关
    const escapeReachedDocument = outerEsc.mock.calls.some(
      (call) => (call[0] as KeyboardEvent).key === "Escape",
    );
    expect(escapeReachedDocument).toBe(false);

    document.removeEventListener("keydown", outerEsc);
  });

  it("工具条动作仍是原行为：点「高亮」会把选区提交到 /api/annotations", async () => {
    const user = userEvent.setup();
    const { container } = renderAnnotatable();
    postSpy.mockResolvedValue({
      headers: { get: () => "application/json" },
      json: async () => ({ id: 11 }),
    });

    selectWithKeyboard(container);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "高亮" }),
      ),
    );

    await user.keyboard("{Enter}");

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy.mock.calls[0][0]).toBe("/api/annotations");
    expect(postSpy.mock.calls[0][1]).toMatchObject({
      questionId: 1,
      startOffset: 0,
      endOffset: 4,
      tag: "highlight",
    });
  });

  it("已有标注是可聚焦的真按钮：Tab 能到，Enter 删除同一条", async () => {
    const user = userEvent.setup();
    renderAnnotatable([
      { id: 7, startOffset: 0, endOffset: 4, tag: "highlight" },
    ]);

    const annotationButton = await screen.findByRole("button", {
      name: TEXT.slice(0, 4),
    });
    expect(annotationButton.tagName).toBe("BUTTON");
    expect(annotationButton).toHaveAttribute("type", "button");
    expect(annotationButton).toHaveAttribute("title", "点击删除标注");

    await user.tab();
    expect(document.activeElement).toBe(annotationButton);

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(deleteSpy).toHaveBeenCalledWith("/api/annotations?id=7"),
    );
  });
});
