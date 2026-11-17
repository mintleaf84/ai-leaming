import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatInput } from "../ChatInput";

/**
 * IME 组合态（docs/ux-a11y-audit.md §3.1）：拼音输入时按 Enter 是"确认候选词"。
 *
 * 合成事件的构造是这里最容易写错的地方：React 的 SyntheticKeyboardEvent 把
 * 原生事件挂在 `nativeEvent` 上，而 `isComposing` 是**原生 KeyboardEvent 自身**
 * 的属性（KeyboardEventInit 支持它）。所以在 fireEvent 里要传 `isComposing`
 * 本身；传 `nativeEvent: {...}` 只会给 DOM 事件加一个同名自有属性，
 * React 的 `e.nativeEvent` 仍指向那个 DOM 事件 —— 一个"看起来对、实际不生效"
 * 的假用例。下面两条断言分别覆盖 "isComposing:true" 与 "keyCode 229"。
 */
describe("ChatInput IME 组合态", () => {
  const onSubmit = vi.fn();

  const props = {
    isLoading: false,
    showFavorites: false,
    enableRag: false,
    setEnableRag: vi.fn(),
    onSendMessage: onSubmit,
    onStopGeneration: vi.fn(),
  };

  beforeEach(() => {
    onSubmit.mockClear();
  });

  function typeAndPress(value: string, init: KeyboardEventInit) {
    render(<ChatInput {...props} />);
    const textarea = screen.getByPlaceholderText(/输入问题/);
    fireEvent.change(textarea, { target: { value } });
    fireEvent.keyDown(textarea, init);
    return textarea;
  }

  it("组合态（isComposing）按 Enter 不提交半截拼音", () => {
    typeAndPress("dai", { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("组合态（keyCode 229）按 Enter 不提交", () => {
    typeAndPress("dai", { key: "Enter", keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("反证：非组合态的普通 Enter 仍然提交（守卫没有把功能改没）", () => {
    typeAndPress("你好", { key: "Enter", isComposing: false });
    expect(onSubmit).toHaveBeenCalledWith("你好");
  });

  it("反证：Shift+Enter 仍然不提交（换行）", () => {
    typeAndPress("你好", { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
