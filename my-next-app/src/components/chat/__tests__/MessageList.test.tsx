import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock ChatMessage component before importing MessageList
vi.mock("../ChatMessage", () => ({
  __esModule: true,
  default: ({ message, onDelete }: any) => (
    <div data-testid="chat-message">
      <span>{message.content}</span>
      <button onClick={onDelete}>Delete</button>
    </div>
  ),
}));

import { MessageList } from "../MessageList";

describe("MessageList Component", () => {
  const mockOnDeleteMessage = vi.fn();
  const mockOnSaveToKnowledge = vi.fn();
  const mockOnToggleFavorite = vi.fn();
  const mockOnRetry = vi.fn();
  const messagesEndRef = { current: null } as any;

  const mockMessages = [
    { id: "1", role: "user" as const, content: "Hello", timestamp: Date.now() },
    {
      id: "2",
      role: "assistant" as const,
      content: "Hi there!",
      timestamp: Date.now(),
    },
  ];

  it("renders empty state when no messages", () => {
    render(
      <MessageList
        messages={[]}
        isLoading={false}
        error={null}
        lastFailedMessage={null}
        onDeleteMessage={mockOnDeleteMessage}
        onSaveToKnowledge={mockOnSaveToKnowledge}
        onToggleFavorite={mockOnToggleFavorite}
        onRetry={mockOnRetry}
        messagesEndRef={messagesEndRef}
      />,
    );

    expect(
      screen.getByText("你可以问我任何关于教育心理学或教师招聘的问题"),
    ).toBeInTheDocument();
  });

  it("renders list of messages", () => {
    render(
      <MessageList
        messages={mockMessages}
        isLoading={false}
        error={null}
        lastFailedMessage={null}
        onDeleteMessage={mockOnDeleteMessage}
        onSaveToKnowledge={mockOnSaveToKnowledge}
        onToggleFavorite={mockOnToggleFavorite}
        onRetry={mockOnRetry}
        messagesEndRef={messagesEndRef}
      />,
    );

    const items = screen.getAllByTestId("chat-message");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows error message and retry button", () => {
    render(
      <MessageList
        messages={mockMessages}
        isLoading={false}
        error="Network Timeout"
        lastFailedMessage="Failed msg"
        onDeleteMessage={mockOnDeleteMessage}
        onSaveToKnowledge={mockOnSaveToKnowledge}
        onToggleFavorite={mockOnToggleFavorite}
        onRetry={mockOnRetry}
        messagesEndRef={messagesEndRef}
      />,
    );

    expect(screen.getByText(/Network Timeout/)).toBeInTheDocument();
    const retryBtn = screen.getByText("重试");
    fireEvent.click(retryBtn);
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });
});

/**
 * §3.7 流式回答的播报（批次 B4）。
 *
 * 方案：**不**给消息流容器挂 aria-live —— 正文是逐字增长的，
 * live 区域会把每一个字都念一遍、几十次打断，比不播报更糟。
 * 改为「sr-only 的 role="status" 播报开始/结束 + 正文容器 aria-busy」，
 * 所以下面第 2 条是否定断言：正文不能是 live 区域。
 */
describe("MessageList 流式回答播报", () => {
  const props = {
    messages: [
      { id: "1", role: "user" as const, content: "你好", timestamp: 0 },
      {
        id: "2",
        role: "assistant" as const,
        content: "正在回答",
        timestamp: 0,
      },
    ],
    error: null,
    lastFailedMessage: null,
    onDeleteMessage: vi.fn(),
    onSaveToKnowledge: vi.fn(),
    onToggleFavorite: vi.fn(),
    onRetry: vi.fn(),
    messagesEndRef: { current: null } as { current: HTMLDivElement | null },
  };

  it("生成中播报「正在生成回答」，结束后播报「回答已完成」", () => {
    const { rerender } = render(<MessageList {...props} isLoading={true} />);

    expect(screen.getByRole("status")).toHaveTextContent("AI 正在生成回答");

    rerender(<MessageList {...props} isLoading={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("回答已完成");
    expect(screen.getByRole("status")).not.toHaveTextContent("正在生成回答");
  });

  it("正文容器不是 live 区域（防逐字播报轰炸），生成中只标 aria-busy", () => {
    const { container, rerender } = render(
      <MessageList {...props} isLoading={true} />,
    );

    // 否定断言：全容器内没有任何显式 aria-live（逐字 live 会让屏读器念几十遍）
    expect(container.querySelector("[aria-live]")).toBeNull();

    const transcript = container.querySelector(".max-w-3xl") as HTMLElement;
    expect(transcript).toHaveAttribute("aria-busy", "true");

    rerender(<MessageList {...props} isLoading={false} />);
    expect(
      container.querySelector(".max-w-3xl"),
    ).toHaveAttribute("aria-busy", "false");
  });

  it("空对话不播报（没有可播的状态）", () => {
    render(<MessageList {...props} messages={[]} isLoading={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("生成失败时播报失败，而不是谎报「已完成」", () => {
    const { rerender } = render(<MessageList {...props} isLoading={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("AI 正在生成回答");

    rerender(
      <MessageList
        {...props}
        isLoading={false}
        error="Network Timeout"
        lastFailedMessage="重试内容"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("回答生成失败");
    expect(screen.getByRole("status")).not.toHaveTextContent("回答已完成");
  });
});

