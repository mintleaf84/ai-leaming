import userEvent from "@testing-library/user-event";
/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { KnowledgePointSelector } from "../KnowledgePointSelector";
import { useRouter } from "next/navigation";
import { getKnowledgeTreeAction } from "@/server/actions/practice";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock server actions
vi.mock("@/server/actions/practice", () => ({
  getKnowledgeTreeAction: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

const mockTreeData = [
  {
    name: "数学",
    path: "math",
    count: 10,
    children: [
      { name: "代数", path: "math/algebra", count: 5, children: [] },
      { name: "几何", path: "math/geometry", count: 5, children: [] },
    ],
  },
  {
    name: "英语",
    path: "english",
    count: 5,
    children: [],
  },
];

describe("KnowledgePointSelector Component", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (getKnowledgeTreeAction as any).mockResolvedValue({
      data: { success: true, tree: mockTreeData },
    });
  });

  it("opens dialog when trigger is clicked", async () => {
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );

    const trigger = screen.getByText("Open Selector");
    fireEvent.click(trigger);

    expect(screen.getByText("选择专项突破知识点")).toBeInTheDocument();

    // Should show loading then data
    await waitFor(() => {
      expect(screen.getByText("数学")).toBeInTheDocument();
      expect(screen.getByText("英语")).toBeInTheDocument();
    });
  });

  it("toggles selection of knowledge points", async () => {
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );

    fireEvent.click(screen.getByText("Open Selector"));

    await waitFor(() => screen.getByText("数学"));

    // Click '英语' node
    const englishNode = screen.getByText("英语");
    fireEvent.click(englishNode);

    expect(screen.getByText(/已选/)).toHaveTextContent("已选 1 个考点");

    // Click again to deselect
    fireEvent.click(englishNode);
    expect(screen.getByText(/已选/)).toHaveTextContent("已选 0 个考点");
  });

  it("navigates to practice page with correct params on start", async () => {
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );

    fireEvent.click(screen.getByText("Open Selector"));
    await waitFor(() => screen.getByText("英语"));

    // Select '英语'
    fireEvent.click(screen.getByText("英语"));

    // Click '开始练习'
    const startBtn = screen.getByText("开始练习");
    fireEvent.click(startBtn);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/practice?mode=focus&limit=25&tags=english"),
    );
  });

  it("shows warning when starting without selection", async () => {
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );

    fireEvent.click(screen.getByText("Open Selector"));
    await waitFor(() => screen.getByText("英语"));

    const startBtn = screen.getByText("开始练习");
    // '开始练习' button is disabled when selectedTags.length === 0 in the JSX
    // But the handleStart function also has a check.
    // Let's check if the button is indeed disabled.
    expect(startBtn).toBeDisabled();
  });

  it("handles recursive expansion", async () => {
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );

    fireEvent.click(screen.getByText("Open Selector"));
    await waitFor(() => screen.getByText("数学"));

    // '代数' should not be visible initially because '数学' is not expanded
    expect(screen.queryByText("代数")).not.toBeInTheDocument();

    // Click on the chevron/folder of '数学' to expand
    // The TreeNode handles expansion on click of the main div if it has children
    const mathNode = screen.getByText("数学");
    fireEvent.click(mathNode);

    expect(screen.getByText("代数")).toBeInTheDocument();
    expect(screen.getByText("几何")).toBeInTheDocument();
  });
});

/**
 * a11y 批次 B5：树节点从「整行 div onClick + 内层 span/div」换成三个真控件
 * （展开箭头按钮 / role=checkbox 按钮 / 名称按钮），行本身不再挂 onClick。
 * 锁住「键盘等价」：Tab 依次经过三个控件、Enter/Space 与点击等价。
 */
describe("KnowledgePointSelector 键盘操作（a11y B5）", () => {
  const openSelector = async () => {
    const user = userEvent.setup();
    render(
      <KnowledgePointSelector>
        <button>Open Selector</button>
      </KnowledgePointSelector>,
    );
    await user.click(screen.getByText("Open Selector"));
    await screen.findByText("数学");
    return user;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: vi.fn() });
    (getKnowledgeTreeAction as any).mockResolvedValue({
      data: { success: true, tree: mockTreeData },
    });
  });

  it("Tab 依次经过展开箭头 → 复选框 → 名称按钮，Enter 展开父节点", async () => {
    const user = await openSelector();

    const expandBtn = screen.getByRole("button", { name: "展开数学" });
    expandBtn.focus();
    expect(expandBtn).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("checkbox", { name: "数学" })).toHaveFocus();

    const nameBtn = screen.getByText("数学").closest("button");
    expect(nameBtn).not.toBeNull();
    await user.tab();
    expect(nameBtn).toHaveFocus();

    // 回到箭头，Enter 展开：与点击等价
    expandBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("代数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起数学" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("复选框是 role=checkbox 的按钮：Space 切换选中并播报 aria-checked", async () => {
    const user = await openSelector();

    const checkbox = screen.getByRole("checkbox", { name: "英语" });
    checkbox.focus();
    expect(checkbox).toHaveFocus();

    await user.keyboard(" ");
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/已选/)).toHaveTextContent("已选 1 个考点");

    await user.keyboard(" ");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/已选/)).toHaveTextContent("已选 0 个考点");
  });

  it("名称按钮：叶子上 Enter 与点击等价选中，父节点上 Enter 展开", async () => {
    const user = await openSelector();

    const leafBtn = screen.getByText("英语").closest("button")!;
    leafBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText(/已选/)).toHaveTextContent("已选 1 个考点");

    const parentBtn = screen.getByText("数学").closest("button")!;
    parentBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("代数")).toBeInTheDocument();
  });
});
