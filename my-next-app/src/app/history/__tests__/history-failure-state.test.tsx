/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归（批次 A：练习记录页）。
 *
 * `getSessionHistoryAction` 抛错时，页面原来会把 `history` 保持为
 * `{ items: [] }`，于是渲染"暂无练习记录"——把服务端故障说成"你还没练过"。
 * 现在要求错误态 + 重试，且重试成功后回到列表。
 */

const { mockHistory, mockModes } = vi.hoisted(() => ({
  mockHistory: vi.fn(),
  mockModes: vi.fn(),
}));

vi.mock("@/server/actions/history", () => ({
  getSessionHistoryAction: mockHistory,
  getAvailableModesAction: mockModes,
  deleteSessionAction: vi.fn(),
  renameSessionAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// 展开面板 / 导入弹窗与本用例无关（各自有自己的测试）
vi.mock("../components/HistoryCardExpanded", () => ({
  HistoryCardExpanded: () => null,
}));
vi.mock("@/components/import/ImportFenbiModal", () => ({
  ImportFenbiModal: () => null,
}));

import HistoryPage from "../page";

const oneSession = {
  id: "s-1",
  sessionName: "德育专项",
  mode: "focus",
  totalQuestions: 10,
  correctCount: 8,
  accuracy: 80,
  createdAt: "2026-11-19T09:00:00.000Z",
  completedAt: "2026-11-19T09:20:00.000Z",
};

describe("练习记录：接口失败 ≠ 没有记录（W1 批次 A）", () => {
  beforeEach(() => {
    mockHistory.mockReset();
    mockModes.mockReset();
    mockModes.mockResolvedValue({ data: [] });
  });

  it("action 抛错时渲染错误态，而不是「暂无练习记录」", async () => {
    mockHistory.mockRejectedValue(new Error("数据库不可用"));

    render(<HistoryPage />);

    expect(await screen.findByText("练习记录加载失败")).toBeInTheDocument();
    expect(screen.getByText("数据库不可用")).toBeInTheDocument();
    expect(screen.queryByText("暂无练习记录")).not.toBeInTheDocument();
  });

  it("点重试重新拉取，成功后渲染记录卡片", async () => {
    mockHistory
      .mockRejectedValueOnce(new Error("数据库不可用"))
      .mockResolvedValueOnce({
        data: {
          items: [oneSession],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      });

    render(<HistoryPage />);

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("德育专项")).toBeInTheDocument();
    expect(screen.queryByText("练习记录加载失败")).not.toBeInTheDocument();
  });

  it("反证：真的没有记录时仍然渲染空态", async () => {
    mockHistory.mockResolvedValue({
      data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 },
    });

    render(<HistoryPage />);

    expect(await screen.findByText("暂无练习记录")).toBeInTheDocument();
    expect(screen.queryByText("练习记录加载失败")).not.toBeInTheDocument();
  });
});
