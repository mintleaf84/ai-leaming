import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderProgressBar } from "../HeaderProgressBar";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, style, className, animate }: any) => (
      <div className={className} style={{ ...style, width: animate?.width }}>
        {children}
      </div>
    ),
  },
}));

describe("HeaderProgressBar Component", () => {
  const mockOnExit = vi.fn();

  it("renders correct progress and status in practicing mode", () => {
    render(
      <HeaderProgressBar
        status="practicing"
        currentIndex={4}
        totalCount={10}
        onExit={mockOnExit}
      />,
    );

    expect(screen.getByText("📝 练习中")).toBeInTheDocument();
    expect(screen.getByText("题量: 5 / 10")).toBeInTheDocument();
    // Progress should be (4/10)*100 = 40% (since currentIndex starts from 0)
    // Wait, the logic is: totalCount > 0 ? ((currentIndex + (status === 'finished' ? 1 : 0)) / totalCount) * 100 : 0;
    // status is 'practicing', so (4/10) * 100 = 40%
  });

  it("renders correct progress in finished mode", () => {
    render(
      <HeaderProgressBar
        status="finished"
        currentIndex={9}
        totalCount={10}
        onExit={mockOnExit}
      />,
    );

    expect(screen.getByText("✅ 已完成")).toBeInTheDocument();
    expect(screen.getByText("题量: 10 / 10")).toBeInTheDocument();
    // Progress should be (9 + 1)/10 * 100 = 100%
  });

  it("calls onExit when exit button is clicked", () => {
    render(
      <HeaderProgressBar
        status="practicing"
        currentIndex={0}
        totalCount={10}
        onExit={mockOnExit}
      />,
    );

    const exitBtn = screen.getByRole("button"); // The X icon button
    fireEvent.click(exitBtn);
    expect(mockOnExit).toHaveBeenCalledTimes(1);
  });

  it("shows timer when timerEnabled is true and status is practicing", () => {
    render(
      <HeaderProgressBar
        status="practicing"
        currentIndex={0}
        totalCount={10}
        onExit={mockOnExit}
        timerEnabled={true}
        timerMode="count_up"
      />,
    );

    // Timer renders Clock icon and 00:00
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("hides timer when status is loading", () => {
    render(
      <HeaderProgressBar
        status="loading"
        currentIndex={0}
        totalCount={10}
        onExit={mockOnExit}
        timerEnabled={true}
      />,
    );

    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
  });
});
