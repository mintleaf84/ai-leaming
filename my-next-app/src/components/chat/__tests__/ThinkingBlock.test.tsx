import { render, screen, fireEvent, act } from "@testing-library/react";
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

    // Need to find the copy button. It's only visible when !isThinking and isExpanded.
    const copyBtn = screen.getByRole("button");
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("To be copied");

    // Check for success icon (mocked check icon)
    // Since we are using lucide-react, we can't easily check the icon but we can check if it stays consistent.
  });
});
