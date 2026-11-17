/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { HistoryCardItem } from "../HistoryCardItem";
import { expectFocusRing } from "@/test-utils/focus-indicator";
import type { SessionHistoryItem } from "@/lib/services/history";

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

function renderCard(isEditing: boolean) {
  const props = {
    item,
    onExpand: vi.fn(),
    onDelete: vi.fn(),
    onStartEdit: vi.fn(),
    isEditing,
    editingName: "智能刷题 #1",
    setEditingName: vi.fn(),
    onSaveName: vi.fn(),
  };
  render(<HistoryCardItem {...props} />);
  return props;
}

describe("HistoryCardItem 重命名输入框焦点指示（批次 B3）", () => {
  it("聚焦后存在可见焦点指示，不再只有静态 border-b-2", () => {
    renderCard(true);
    const input = screen.getByRole("textbox");

    expectFocusRing(input);
  });

  it("是真交互的文本框：聚焦后输入会写回 editingName", () => {
    const props = renderCard(true);
    const input = screen.getByRole("textbox");

    // 真交互：焦点到位 → 打字 → 受控回写
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "改个名字" } });

    expect(props.setEditingName).toHaveBeenCalledWith("改个名字");
    expect(props.onExpand).not.toHaveBeenCalled(); // 编辑态下点击不冒泡触发展开
  });
});
