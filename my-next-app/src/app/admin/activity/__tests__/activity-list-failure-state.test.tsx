/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归：管理端「行为记录」接口失败时不能渲染成"暂无行为记录"。
 *
 * 以前的实现只 toast 一下，列表保持空数组，于是页面显示"暂无行为记录"——
 * 管理员会以为没人练题，而不是后台查询挂了。现在必须出现错误态 + 可点的重试。
 */

const { mockGetActivity } = vi.hoisted(() => ({
  mockGetActivity: vi.fn(),
}));

vi.mock("@/server/actions/activity", () => ({
  getUserActivityAction: mockGetActivity,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ActivityList } from "../_components/ActivityList";

describe("行为记录：接口失败 ≠ 没有记录（W1）", () => {
  beforeEach(() => {
    mockGetActivity.mockReset();
  });

  it("action 返回 serverError 时渲染错误态，且不出现空态文案", async () => {
    mockGetActivity.mockResolvedValue({ serverError: "数据库连接失败" });

    render(<ActivityList />);

    expect(await screen.findByText("行为记录加载失败")).toBeInTheDocument();
    expect(screen.getByText("数据库连接失败")).toBeInTheDocument();
    expect(screen.queryByText("暂无行为记录")).not.toBeInTheDocument();
  });

  it("点重试会重新调用 action，成功后渲染数据", async () => {
    mockGetActivity
      .mockResolvedValueOnce({ serverError: "数据库连接失败" })
      .mockResolvedValueOnce({
        data: {
          total: 1,
          logs: [
            {
              id: 1,
              username: "同学甲",
              is_correct: true,
              question_content: "题干内容",
              dimension: "knowledge",
              duration_ms: 1200,
              user_answer: "A",
              timestamp: "2026-11-19T10:00:00.000Z",
            },
          ],
        },
      });

    render(<ActivityList />);

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockGetActivity).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("题干内容")).toBeInTheDocument();
    expect(screen.queryByText("行为记录加载失败")).not.toBeInTheDocument();
  });

  it("反证：真的没有记录时仍然渲染空态（不能被错误态抢走）", async () => {
    mockGetActivity.mockResolvedValue({ data: { total: 0, logs: [] } });

    render(<ActivityList />);

    expect(await screen.findByText("暂无行为记录")).toBeInTheDocument();
    expect(screen.queryByText("行为记录加载失败")).not.toBeInTheDocument();
  });
});
