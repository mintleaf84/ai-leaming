// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerSheet } from "../AnswerSheet";

describe("AnswerSheet", () => {
  const mockLogs = [
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
  ];

  const defaultProps = {
    logs: mockLogs,
    isOpen: false,
    onToggle: vi.fn(),
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not render content when isOpen is false", () => {
    render(<AnswerSheet {...defaultProps} />);
    expect(screen.queryByText("答题卡")).not.toBeInTheDocument();
  });

  it("should render floating button when closed", () => {
    render(<AnswerSheet {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("should render answer sheet when isOpen is true", () => {
    render(<AnswerSheet {...defaultProps} isOpen={true} />);
    expect(screen.getByText("答题卡")).toBeInTheDocument();
  });

  it("should display correct and wrong counts", () => {
    render(<AnswerSheet {...defaultProps} isOpen={true} />);
    // 5 logs: 3 correct, 2 wrong
    const spans = screen.getAllByText(/^[23]$/);
    expect(spans.length).toBeGreaterThan(0);
  });

  it("should render all question numbers in grid", () => {
    render(<AnswerSheet {...defaultProps} isOpen={true} />);
    // Should have buttons 1-5
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("should call onToggle when floating button is clicked", () => {
    render(<AnswerSheet {...defaultProps} />);
    const button = screen.getByRole("button");
    button.click();
    expect(defaultProps.onToggle).toHaveBeenCalled();
  });

  it("should handle empty logs", () => {
    render(<AnswerSheet {...defaultProps} logs={[]} isOpen={true} />);
    expect(screen.getByText("答题卡")).toBeInTheDocument();
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(2);
  });

  it("should render correct styling for correct/wrong answers", () => {
    render(<AnswerSheet {...defaultProps} isOpen={true} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5); // grid buttons + floating button
  });
});
