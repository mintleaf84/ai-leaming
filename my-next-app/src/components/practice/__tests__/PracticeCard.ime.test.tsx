import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PracticeCard } from "../PracticeCard";

/**
 * 填空题 + IME 组合态（docs/ux-a11y-audit.md §3.1）：
 * 用拼音答"待定"，按 Enter 确认候选词时不能把 "dai" 提交判分。
 *
 * `isComposing` 是原生 KeyboardEvent 的属性，fireEvent 要传它本身而不是
 * `nativeEvent: {...}`（后者只是给 DOM 事件加一个同名自有属性，不生效）。
 */
describe("PracticeCard 填空题 IME 组合态", () => {
  const onFillBlankSubmit = vi.fn();

  const fillBlankQuestion = {
    id: 901,
    content: "班级管理的根本目的是_____。",
    answer: "待定",
    options: [],
    type: "fill",
    dimension: "knowledge",
  };

  beforeEach(() => {
    onFillBlankSubmit.mockClear();
  });

  function renderCard() {
    render(
      <PracticeCard
        question={fillBlankQuestion}
        isMulti={false}
        selectedOptions={[]}
        onOptionClick={vi.fn()}
        onSubmitMulti={vi.fn()}
        isFillBlank
        onFillBlankSubmit={onFillBlankSubmit}
      />,
    );
    return screen.getByPlaceholderText("请输入第 1 个空的答案");
  }

  it("组合态（isComposing）按 Enter 不提交", () => {
    const input = renderCard();
    fireEvent.change(input, { target: { value: "dai" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onFillBlankSubmit).not.toHaveBeenCalled();
  });

  it("组合态（keyCode 229）按 Enter 不提交", () => {
    const input = renderCard();
    fireEvent.change(input, { target: { value: "dai" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onFillBlankSubmit).not.toHaveBeenCalled();
  });

  it("反证：非组合态的普通 Enter 仍然提交", () => {
    const input = renderCard();
    fireEvent.change(input, { target: { value: "待定" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(onFillBlankSubmit).toHaveBeenCalledWith("待定");
  });
});
