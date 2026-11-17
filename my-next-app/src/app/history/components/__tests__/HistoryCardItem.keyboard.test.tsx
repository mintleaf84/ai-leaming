/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { HistoryCardItem } from "../HistoryCardItem";
import type { SessionHistoryItem } from "@/lib/services/history";

/**
 * 批次 B5：卡片外层的 `div onClick` 不是真语义。
 *
 * 处置（第 2 类）：外层点击只是「展开详情浮层」的便捷路径，卡片里已经有
 * 重命名/删除按钮。给外层补 role="button" 会让同一张卡出现两个可聚焦控件做
 * 同一件事，因此把展开动作挂到标题按钮上，外层不再承担点击语义。
 */

const item: SessionHistoryItem = {
  id: "sess-1",
  sessionName: "智能刷题 #1",
  totalQuestions: 20,
  correctCount: 15,
  reviewCount: 3,
  createdAt: "2026-11-01T08:00:00.000Z",
  accuracy: 75,
  practiceMode: "smart",
};

function renderCard(
  overrides: Partial<React.ComponentProps<typeof HistoryCardItem>> = {},
) {
  const props = {
    item,
    onExpand: vi.fn(),
    onDelete: vi.fn(),
    onStartEdit: vi.fn(),
    isEditing: false,
    editingName: "智能刷题 #1",
    setEditingName: vi.fn(),
    onSaveName: vi.fn(),
    ...overrides,
  };
  const utils = render(<HistoryCardItem {...props} />);
  return { ...props, ...utils };
}

describe("HistoryCardItem 键盘可达（批次 B5）", () => {
  it("标题是展开按钮：Tab 能到，Enter / Space 各触发一次 onExpand", async () => {
    const user = userEvent.setup();
    const { onExpand } = renderCard();

    const titleButton = screen.getByRole("button", { name: "智能刷题 #1" });
    expect(titleButton).toHaveAttribute("aria-haspopup", "dialog");

    await user.tab();
    expect(document.activeElement).toBe(titleButton);

    await user.keyboard("{Enter}");
    expect(onExpand).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it("没有嵌套 button：标题/重命名/删除是三个平级按钮，各做各的事", async () => {
    const user = userEvent.setup();
    const { onStartEdit, onDelete, onExpand } = renderCard();

    // 结构断言：合法 HTML（button 里不能再套 button）
    expect(document.querySelectorAll("button button")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "重命名会话" }));
    expect(onStartEdit).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("外层卡片不再是可聚焦控件（不出现两个做同一件事的入口）", () => {
    const { container } = renderCard();

    // 三个平级按钮：标题（展开）/ 重命名 / 删除
    expect(screen.getAllByRole("button")).toHaveLength(3);
    // 卡片根节点不带 role=button，也没有 tabIndex
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute("role");
    expect(root).not.toHaveAttribute("tabindex");
  });
});
