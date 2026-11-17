/** @vitest-environment jsdom */
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import QuestionPicker from "../QuestionPicker";

/**
 * 批次 B2：QuestionPicker 换成 ui/dialog。
 *
 * 它是**居中模态**（原实现是 fixed inset-0 + flex 居中 + max-w-lg），不是锚在
 * 输入框下方的 popover，所以不该用 Popover。这组测试锁住三件原有行为：
 * 打开即聚焦搜索框、Esc 关闭、点遮罩关闭；再补原来缺的 role/aria-modal。
 */
vi.mock("@/server/actions/question", () => ({
  searchQuestionsAction: vi.fn(),
}));

import { searchQuestionsAction } from "@/server/actions/question";

const questions = [
  {
    id: 42,
    type: "single_choice",
    content: "下列哪项属于教育目的的功能？",
    tags: ["教育学", "教育目的"],
  },
];

function Harness({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <textarea aria-label="笔记正文" />
      <button onClick={() => setOpen(true)}>引用题目</button>
      <QuestionPicker
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        onSelect={onSelect}
      />
    </>
  );
}

function openPicker() {
  const trigger = screen.getByRole("button", { name: "引用题目" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("QuestionPicker（批次 B2：换成 Dialog，不是 Popover）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      searchQuestionsAction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ success: true, questions });
  });

  it("有 dialog 语义：role=dialog + aria-modal", async () => {
    render(<Harness onClose={vi.fn()} onSelect={vi.fn()} />);
    openPicker();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("引用题目");
  });

  it("打开后焦点落在搜索框（原来 Input 上的 autoFocus 意图）", async () => {
    render(<Harness onClose={vi.fn()} onSelect={vi.fn()} />);
    openPicker();

    const input = screen.getByPlaceholderText(/搜索题目内容/);
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("Esc 关闭（原有行为）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSelect={vi.fn()} />);
    openPicker();
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("组合态的 Esc 不关闭浮层（Esc 是取消输入法候选词）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSelect={vi.fn()} />);
    openPicker();
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
      isComposing: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("点遮罩仍能关闭（原有行为）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSelect={vi.fn()} />);
    openPicker();
    await screen.findByRole("dialog");

    const overlay = document.querySelector(".bg-black\\/50");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("选中题目仍回调 onSelect，并归还焦点到触发元素", async () => {
    const onSelect = vi.fn();
    render(<Harness onClose={vi.fn()} onSelect={onSelect} />);
    const trigger = openPicker();

    const option = await screen.findByRole("button", {
      name: /下列哪项属于教育目的的功能/,
    });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith(42);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Enter 仍在组合态下被忽略（不把半截拼音当搜索词）", async () => {
    render(<Harness onClose={vi.fn()} onSelect={vi.fn()} />);
    openPicker();

    const input = screen.getByPlaceholderText(/搜索题目内容/);
    (
      searchQuestionsAction as unknown as ReturnType<typeof vi.fn>
    ).mockClear();

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(searchQuestionsAction).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(searchQuestionsAction).toHaveBeenCalledTimes(1));
  });
});
