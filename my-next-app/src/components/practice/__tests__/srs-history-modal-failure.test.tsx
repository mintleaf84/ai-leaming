/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归：「记忆溯源」弹窗。
 *
 * 以前两个 action 失败时只是 `if (result.data)` 跳过，history/predictions 保持
 * 空数组，弹窗显示"复习记录 (0)" —— 用户会以为记忆数据丢了。
 */

const { mockHistory, mockPredictions } = vi.hoisted(() => ({
  mockHistory: vi.fn(),
  mockPredictions: vi.fn(),
}));

vi.mock("@/server/actions/srs", () => ({
  getQuestionSrsHistoryAction: mockHistory,
  getQuestionSrsPredictionsAction: mockPredictions,
}));

import { SrsHistoryModal } from "../SrsHistoryModal";

describe("记忆溯源：失败不能显示成「还没复习过」（W1）", () => {
  beforeEach(() => {
    mockHistory.mockReset();
    mockPredictions.mockReset();
    mockPredictions.mockResolvedValue({ data: [] });
  });

  it("历史 action 失败时显示错误态", async () => {
    mockHistory.mockResolvedValue({ serverError: "SRS 记录读取失败" });

    render(<SrsHistoryModal questionId={1} isOpen onClose={() => {}} />);

    expect(await screen.findByText("记忆轨迹加载失败")).toBeInTheDocument();
    expect(screen.getByText("SRS 记录读取失败")).toBeInTheDocument();
    expect(screen.queryByText(/复习记录 \(0\)/)).not.toBeInTheDocument();
  });

  it("点重试重新拉取，成功后显示复习记录", async () => {
    mockHistory
      .mockResolvedValueOnce({ serverError: "SRS 记录读取失败" })
      .mockResolvedValueOnce({
        data: [
          {
            date: "2026-11-18T09:00:00.000Z",
            isCorrect: true,
            duration: 4200,
          },
        ],
      });

    render(<SrsHistoryModal questionId={1} isOpen onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("复习记录 (1)")).toBeInTheDocument();
    expect(screen.queryByText("记忆轨迹加载失败")).not.toBeInTheDocument();
  });
});
