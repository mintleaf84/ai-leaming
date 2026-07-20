import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatModeToggle } from "../ChatModeToggle";

describe("ChatModeToggle Component", () => {
  const mockOnModeChange = vi.fn();

  it("renders standard mode by default", () => {
    render(<ChatModeToggle mode="standard" onModeChange={mockOnModeChange} />);
    expect(screen.getByText("标准助手")).toBeInTheDocument();
  });

  it("renders socratic mode when passed", () => {
    render(<ChatModeToggle mode="socratic" onModeChange={mockOnModeChange} />);
    expect(screen.getByText("苏格拉底导师")).toBeInTheDocument();
  });

  // Radix UI DropdownMenu 需要 pointerdown 事件才能正确开关
  it("shows dropdown items when clicked", async () => {
    render(<ChatModeToggle mode="standard" onModeChange={mockOnModeChange} />);

    const trigger = screen.getByRole("button");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // 等待 Radix UI 渲染下拉菜单项
    expect(await screen.findByText("直接回答，简洁明了")).toBeInTheDocument();
    expect(await screen.findByText("循循善诱，启发思考")).toBeInTheDocument();

    fireEvent.click(screen.getByText("循循善诱，启发思考"));
    expect(mockOnModeChange).toHaveBeenCalledWith("socratic");
  });
});
