/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归：管理端「纠错反馈」列表失败时不能渲染成"暂无反馈"。
 *
 * 原实现里 `Promise.all` 的两个 action 失败都只是 `if (result.data)` 跳过，
 * items 保持 []，页面显示"暂无反馈"。现在要求错误态 + 重试。
 */

const { mockList, mockCounts } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCounts: vi.fn(),
}));

vi.mock("@/server/actions/admin", () => ({
  getFeedbackListAction: mockList,
  getFeedbackCountsAction: mockCounts,
  resolveFeedbackAction: vi.fn(),
  dismissFeedbackAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import FeedbackPage from "../page";

const oneItem = {
  id: 7,
  question_id: 101,
  question_content: "题目正文",
  user_id: 3,
  username: "小明",
  feedback_type: "wrong_answer",
  description: "答案应为 B",
  status: "pending",
  created_at: "2026-11-19T08:00:00.000Z",
  resolved_at: null,
};

describe("纠错反馈：接口失败 ≠ 没有反馈（W1）", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCounts.mockReset();
    mockCounts.mockResolvedValue({
      data: { pending: 0, resolved: 0, dismissed: 0 },
    });
  });

  it("列表 action 返回 serverError 时渲染错误态，而不是空态", async () => {
    mockList.mockResolvedValue({ serverError: "查询超时" });

    render(<FeedbackPage />);

    expect(await screen.findByText("反馈列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("查询超时")).toBeInTheDocument();
    expect(screen.queryByText("暂无反馈")).not.toBeInTheDocument();
  });

  it("点重试重新拉取，成功后渲染条目", async () => {
    mockList
      .mockResolvedValueOnce({ serverError: "查询超时" })
      .mockResolvedValueOnce({ data: { total: 1, items: [oneItem] } });

    render(<FeedbackPage />);

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/题目正文/)).toBeInTheDocument();
    expect(screen.queryByText("反馈列表加载失败")).not.toBeInTheDocument();
  });

  it("反证：真的没有反馈时仍然渲染空态", async () => {
    mockList.mockResolvedValue({ data: { total: 0, items: [] } });

    render(<FeedbackPage />);

    expect(await screen.findByText("暂无反馈")).toBeInTheDocument();
    expect(screen.queryByText("反馈列表加载失败")).not.toBeInTheDocument();
  });
});
