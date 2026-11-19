/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归：专项突破的「知识点选择」对话框。
 *
 * 以前 `.catch(() => toast.error(...))` 之后就结束了：树保持空数组，对话框里
 * 显示"暂无知识点数据，请先导入教材"。用户会去翻教材，而真正该做的是重试。
 */

const { mockTree } = vi.hoisted(() => ({ mockTree: vi.fn() }));

vi.mock("@/server/actions/practice", () => ({
  getKnowledgeTreeAction: mockTree,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

import { KnowledgePointSelector } from "../KnowledgePointSelector";

async function openDialog() {
  render(
    <KnowledgePointSelector>
      <button type="button">专项突破</button>
    </KnowledgePointSelector>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "专项突破" }));
}

describe("知识点选择：加载失败要给恢复路径（W1）", () => {
  beforeEach(() => {
    mockTree.mockReset();
    mockPush.mockReset();
  });

  it("action 返回 serverError 时显示错误态，而不是「暂无知识点数据」", async () => {
    mockTree.mockResolvedValue({ serverError: "知识点表读取失败" });

    await openDialog();

    expect(await screen.findByText("知识点加载失败")).toBeInTheDocument();
    expect(screen.getByText("知识点表读取失败")).toBeInTheDocument();
    expect(
      screen.queryByText("暂无知识点数据，请先导入教材"),
    ).not.toBeInTheDocument();
  });

  it("点重试重新拉取，成功后渲染知识点树", async () => {
    mockTree
      .mockResolvedValueOnce({ serverError: "知识点表读取失败" })
      .mockResolvedValueOnce({
        data: {
          tree: [{ path: "教育学/德育", name: "德育", children: [] }],
        },
      });

    await openDialog();

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockTree).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("德育")).toBeInTheDocument();
    expect(screen.queryByText("知识点加载失败")).not.toBeInTheDocument();
  });
});
