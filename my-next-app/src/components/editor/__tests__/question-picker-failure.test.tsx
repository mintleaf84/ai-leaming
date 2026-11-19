/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * W1 回归：「引用题目」选择器。
 *
 * 搜索失败原来和"没搜到"共用同一个空态（`未找到匹配的题目`），用户会以为
 * 题库里没有这道题，而实际上是搜索请求失败了。
 */

const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));

vi.mock("@/server/actions/question", () => ({
  searchQuestionsAction: mockSearch,
}));

import QuestionPicker from "../QuestionPicker";

describe("题目选择器：搜索失败 ≠ 没搜到（W1）", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("搜索 action 失败时显示错误态，而不是「未找到匹配的题目」", async () => {
    mockSearch.mockResolvedValue({ success: false, message: "向量检索超时" });

    render(<QuestionPicker isOpen onClose={() => {}} onSelect={() => {}} />);

    expect(await screen.findByText("搜索题目失败")).toBeInTheDocument();
    expect(screen.getByText("向量检索超时")).toBeInTheDocument();
    expect(screen.queryByText("未找到匹配的题目")).not.toBeInTheDocument();
  });

  it("点重试重新搜索，成功后渲染结果", async () => {
    mockSearch
      .mockResolvedValueOnce({ success: false, message: "向量检索超时" })
      .mockResolvedValueOnce({
        success: true,
        questions: [
          {
            id: 11,
            content: "被引用的题目",
            type: "single_choice",
            tags: ["德育"],
          },
        ],
      });

    render(<QuestionPicker isOpen onClose={() => {}} onSelect={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("被引用的题目")).toBeInTheDocument();
    expect(screen.queryByText("搜索题目失败")).not.toBeInTheDocument();
  });
});
