import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ThinkingBlock from "../ThinkingBlock";

describe("ThinkingBlock Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders thinking state correctly", () => {
    render(
      <ThinkingBlock
        content="Thinking process..."
        isThinking={true}
        thinkingTimeMs={1000}
      />,
    );

    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
    expect(screen.getByText("Thinking process...")).toBeInTheDocument();
    expect(screen.getByText(/1.0s/)).toBeInTheDocument();
  });

  it("increments thinking time when isThinking is true", () => {
    render(
      <ThinkingBlock
        content="Thinking..."
        isThinking={true}
        thinkingTimeMs={0}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText(/0.5s/)).toBeInTheDocument();
  });

  it("toggles content visibility when header is clicked", () => {
    render(<ThinkingBlock content="Details here" isThinking={false} />);

    const header = screen.getByText(/已深度思考/).parentElement!;

    // Initially expanded
    expect(screen.getByText("Details here")).toBeInTheDocument();

    // Collapse
    fireEvent.click(header);
    expect(screen.queryByText("Details here")).not.toBeInTheDocument();

    // Expand again
    fireEvent.click(header);
    expect(screen.getByText("Details here")).toBeInTheDocument();
  });

  it("copies content to clipboard", async () => {
    render(<ThinkingBlock content="To be copied" isThinking={false} />);

    // 展开开关也是按钮，用可访问名区分
    const copyBtn = screen.getByRole("button", { name: "复制思考过程" });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("To be copied");

    // Check for success icon (mocked check icon)
    // Since we are using lucide-react, we can't easily check the icon but we can check if it stays consistent.
  });

  it("键盘可达：标题行是真按钮，Tab 能到，Enter / Space 各触发一次切换", async () => {
    // 本用例不用假时钟：user-event 的键盘序列依赖真实时钟推进
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ThinkingBlock content="Keyboard details" isThinking={false} />);

    const toggle = screen.getByRole("button", { name: /已深度思考/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls");

    // Tab 能到（展开按钮是浮层里第一个可聚焦控件）
    await user.tab();
    expect(document.activeElement).toBe(toggle);

    // Enter：收起（次按键只切换一次）
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Keyboard details")).not.toBeInTheDocument();

    // Space：展开
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Keyboard details")).toBeInTheDocument();
    expect(screen.getByText("Keyboard details").id).toBe(
      toggle.getAttribute("aria-controls"),
    );
  });
});
