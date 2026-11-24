import userEvent from "@testing-library/user-event";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PracticeCard } from "../PracticeCard";
import { checkAnswerCorrectness } from "@/lib/services/answer-check";

const mockQuestionSingle = {
  id: 1,
  content: "Which is a primary color?",
  answer: "A",
  options: ["Red", "Green", "Purple"],
  type: "single",
  dimension: "knowledge",
};

const mockQuestionMulti = {
  ...mockQuestionSingle,
  id: 2,
  type: "multi",
  answer: '["A","C"]',
  options: ["Option A", "Option B", "Option C", "Option D"],
};

// 判断题测试数据
const mockQuestionTrueFalse = {
  id: 3,
  content: "教学的根本目的是促进学生全面发展。",
  answer: "A",
  options: ["正确", "错误"],
  type: "truefalse",
  dimension: "knowledge",
};

describe("PracticeCard Component", () => {
  const mockOnOptionClick = vi.fn();
  const mockOnSubmitMulti = vi.fn();

  beforeEach(() => {
    mockOnOptionClick.mockClear();
    mockOnSubmitMulti.mockClear();
  });

  it("renders single choice question correctly", () => {
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    expect(screen.getByText("Which is a primary color?")).toBeInTheDocument();
    expect(screen.getByText("单项选择")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("calls onOptionClick when an option is clicked (single mode)", () => {
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    fireEvent.click(screen.getByText("Red"));
    expect(mockOnOptionClick).toHaveBeenCalledWith("A", "single"); // First option is 'A'

    fireEvent.click(screen.getByText("Green"));
    expect(mockOnOptionClick).toHaveBeenCalledWith("B", "single");
  });

  it("renders multi choice question and submit button", () => {
    render(
      <PracticeCard
        question={mockQuestionMulti}
        isMulti={true}
        selectedOptions={["A", "C"]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    expect(screen.getByText("多项选择")).toBeInTheDocument();
    expect(screen.getByText("确认提交")).toBeInTheDocument();

    fireEvent.click(screen.getByText("确认提交"));
    expect(mockOnSubmitMulti).toHaveBeenCalledTimes(1);
  });

  it("handles option exclusion properly", () => {
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    // Find the "exclude" buttons
    const excludeBtns = screen.getAllByTitle("排除此项");
    expect(excludeBtns.length).toBe(3);

    // Click exclude for the first option ('Red')
    fireEvent.click(excludeBtns[0]);

    // Verify it was marked excluded (line-through class)
    expect(screen.getByText("Red")).toHaveClass("line-through");

    // Clicking the excluded option should NOT trigger onOptionClick
    fireEvent.click(screen.getByText("Red"));
    expect(mockOnOptionClick).not.toHaveBeenCalled();

    // Click again to recover
    const recoverBtn = screen.getByTitle("恢复选项");
    fireEvent.click(recoverBtn);

    expect(screen.getByText("Red")).not.toHaveClass("line-through");
    fireEvent.click(screen.getByText("Red"));
    expect(mockOnOptionClick).toHaveBeenCalledWith("A", "single");
  });

  it("renders truefalse question with correct badge and two buttons", () => {
    render(
      <PracticeCard
        question={mockQuestionTrueFalse}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    // 显示"判断题"标签
    expect(screen.getByText("判断题")).toBeInTheDocument();
    // 渲染"正确"和"错误"两个大按钮
    expect(screen.getByText("正确")).toBeInTheDocument();
    expect(screen.getByText("错误")).toBeInTheDocument();
    // 不显示"排除"提示
    expect(screen.queryByTitle("排除此项")).not.toBeInTheDocument();
    // 不显示多选提交按钮
    expect(screen.queryByText("确认提交")).not.toBeInTheDocument();
  });

  it("calls onOptionClick with A when 正确 button is clicked", () => {
    render(
      <PracticeCard
        question={mockQuestionTrueFalse}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    fireEvent.click(screen.getByText("正确"));
    expect(mockOnOptionClick).toHaveBeenCalledWith("A", "single");
  });

  it("calls onOptionClick with B when 错误 button is clicked", () => {
    render(
      <PracticeCard
        question={mockQuestionTrueFalse}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    fireEvent.click(screen.getByText("错误"));
    expect(mockOnOptionClick).toHaveBeenCalledWith("B", "single");
  });

  it("highlights 正确 button when A is selected", () => {
    render(
      <PracticeCard
        question={mockQuestionTrueFalse}
        isMulti={false}
        selectedOptions={["A"]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    // 选中状态时 "正确" 按钮应有 emerald 样式
    const correctBtn = screen.getByText("正确").closest("button");
    expect(correctBtn).toHaveClass("border-emerald-500");
  });
});

/**
 * a11y 批次 B5：选项主体 / 排除按钮换成真 <button>。
 * 这里锁住「键盘等价」：Tab 能到、Enter/Space 与点击等价、
 * 且被排除的选项仍可聚焦但不响应选中。
 */
describe("PracticeCard 键盘操作（a11y B5）", () => {
  const mockOnOptionClick = vi.fn();
  const mockOnSubmitMulti = vi.fn();

  beforeEach(() => {
    mockOnOptionClick.mockClear();
    mockOnSubmitMulti.mockClear();
  });

  it("Tab 在选项主体与排除按钮之间按 DOM 顺序移动", async () => {
    const user = userEvent.setup();
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    const redBtn = screen.getByText("Red").closest("button");
    expect(redBtn).not.toBeNull();
    redBtn!.focus();
    expect(redBtn).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "排除选项 A" })).toHaveFocus();

    await user.tab();
    expect(screen.getByText("Green").closest("button")).toHaveFocus();
  });

  it("Enter 与点击等价地选中选项", async () => {
    const user = userEvent.setup();
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    const redBtn = screen.getByText("Red").closest("button")!;
    redBtn.focus();
    await user.keyboard("{Enter}");

    expect(mockOnOptionClick).toHaveBeenCalledWith("A", "single");
  });

  it("空格键与点击等价地选中选项", async () => {
    const user = userEvent.setup();
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={true}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    const greenBtn = screen.getByText("Green").closest("button")!;
    greenBtn.focus();
    await user.keyboard(" ");

    expect(mockOnOptionClick).toHaveBeenCalledWith("B", "multi");
  });

  it("排除 / 恢复按钮可用键盘触发，且不误触发选项选中", async () => {
    const user = userEvent.setup();
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    const excludeBtn = screen.getByRole("button", { name: "排除选项 A" });
    excludeBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Red")).toHaveClass("line-through");
    expect(mockOnOptionClick).not.toHaveBeenCalled();

    const restoreBtn = screen.getByRole("button", { name: "恢复选项 A" });
    restoreBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Red")).not.toHaveClass("line-through");
    expect(mockOnOptionClick).not.toHaveBeenCalled();
  });

  it("被排除的选项仍可聚焦，但 Enter 不选中（aria-disabled）", async () => {
    const user = userEvent.setup();
    render(
      <PracticeCard
        question={mockQuestionSingle}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={mockOnOptionClick}
        onSubmitMulti={mockOnSubmitMulti}
      />,
    );

    await user.click(screen.getByRole("button", { name: "排除选项 A" }));

    const redBtn = screen.getByText("Red").closest("button")!;
    expect(redBtn).toHaveAttribute("aria-disabled", "true");
    redBtn.focus();
    expect(redBtn).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(mockOnOptionClick).not.toHaveBeenCalled();
  });
});

/**
 * 填空题「空数推导」与判分口径对齐。
 *
 * 判分的唯一口径（`lib/services/answer-check.ts` 的 fill_blank 分支）只把中文「；」
 * 当空位分隔符，半角「;」属于答案正文。此前这里用 `split(/[；;]/)` 多认了半角分号：
 * 答案 `甲；乙;丙` 会渲染 3 个输入框，提交串恒为 3 段，而正确答案只有 2 段，
 * 空数不一致 → 整题必错，用户无从作答。
 */
describe("PracticeCard 填空题空数推导（与判分同口径）", () => {
  const mixedSeparatorAnswer = "甲；乙;丙";

  const mixedQuestion = {
    id: 910,
    content: "第一空_____，第二空_____。",
    answer: mixedSeparatorAnswer,
    options: [],
    type: "fill_blank",
    dimension: "knowledge",
  };

  function renderFillBlank(onFillBlankSubmit: (answer: string) => void) {
    render(
      <PracticeCard
        question={mixedQuestion}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={vi.fn()}
        onSubmitMulti={vi.fn()}
        isFillBlank
        onFillBlankSubmit={onFillBlankSubmit}
      />,
    );
  }

  it("半角分号不算空位分隔符：只渲染 2 个输入框", () => {
    renderFillBlank(vi.fn((_answer: string) => {}));

    const first = screen.getByPlaceholderText("请输入第 1 个空的答案");
    const second = screen.getByPlaceholderText("请输入第 2 个空的答案");
    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("请输入第 3 个空的答案"),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByPlaceholderText(/个空的答案/)).toHaveLength(2);
  });

  it("第 2 空含半角分号时提交串与正确答案逐空一致，判对", () => {
    const onFillBlankSubmit = vi.fn((_answer: string) => {});
    renderFillBlank(onFillBlankSubmit);

    fireEvent.change(screen.getByPlaceholderText("请输入第 1 个空的答案"), {
      target: { value: "甲" },
    });
    fireEvent.change(screen.getByPlaceholderText("请输入第 2 个空的答案"), {
      target: { value: "乙;丙" },
    });
    fireEvent.click(screen.getByText("确认提交"));

    expect(onFillBlankSubmit).toHaveBeenCalledTimes(1);
    const submitted = onFillBlankSubmit.mock.calls[0][0] as string;
    expect(submitted).toBe(mixedSeparatorAnswer);
    expect(
      checkAnswerCorrectness(submitted, mixedQuestion.answer, [], "fill_blank"),
    ).toBe(true);
  });
});

/**
 * 判分侧的口径本身也要锁住：半角「;」不是空位分隔符。
 * 组件的空数推导必须以这里为准，两边任何一侧改动都要同步。
 */
describe("checkAnswerCorrectness 填空分隔符口径", () => {
  it("半角分号属于答案正文，不是空位分隔符", () => {
    expect(
      checkAnswerCorrectness("甲；乙;丙", "甲；乙;丙", [], "fill_blank"),
    ).toBe(true);
    // 反证：若按半角分号也切分（3 段），这条会误判为对
    expect(
      checkAnswerCorrectness("甲；乙；丙", "甲；乙;丙", [], "fill_blank"),
    ).toBe(false);
  });
});
