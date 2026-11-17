/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import ChatMessage from "../ChatMessage";

// Mock dependencies
vi.mock("next/dynamic", () => ({
  default: (loader: any) => {
    const Component = React.lazy(loader);
    return function MockDynamic(props: any) {
      return (
        <React.Suspense fallback={null}>
          <Component {...props} />
        </React.Suspense>
      );
    };
  },
}));

vi.mock("../MarkdownViewer", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-viewer">{content}</div>
  ),
}));

vi.mock("../ThinkingBlock", () => ({
  default: ({
    content,
    isThinking,
  }: {
    content: string;
    isThinking: boolean;
  }) => (
    <div data-testid="thinking-block">
      {content}
      {isThinking && <span data-testid="thinking-indicator">...</span>}
    </div>
  ),
}));

vi.mock("@/hooks/use-smooth-stream", () => ({
  useSmoothStream: ({ onUpdate }: any) => {
    const contentRef = React.useRef("");
    return {
      addChunk: vi.fn().mockImplementation((chunk: string) => {
        contentRef.current += chunk;
        onUpdate(contentRef.current);
      }),
      reset: vi.fn().mockImplementation((val: string) => {
        contentRef.current = val;
        onUpdate(val);
      }),
    };
  },
}));

describe("ChatMessage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides action buttons when isLoading is true", async () => {
    const assistantMsg = { id: "1", role: "assistant", content: "Hello" };
    render(
      <ChatMessage message={assistantMsg} isLast={true} isLoading={true} />,
    );

    // 演进点：验证加载中不显示“复制”等按钮
    expect(screen.queryByText("复制")).not.toBeInTheDocument();
  });

  it("shows pulse cursor during streaming (not in thinking)", async () => {
    const assistantMsg = { id: "1", role: "assistant", content: "Hello" };
    const { container } = render(
      <ChatMessage message={assistantMsg} isLast={true} isLoading={true} />,
    );

    // 演进点：由于 Mock 的 useSmoothStream 会被 useEffect 调用，这里能拿到内容并渲染主气泡
    expect(await screen.findByTestId("markdown-viewer")).toHaveTextContent(
      "Hello",
    );
    const pulseCursor = container.querySelector(".animate-pulse");
    expect(pulseCursor).toBeInTheDocument();
  });

  it("passes isThinking=true to ThinkingBlock when think tag is unclosed and loading", async () => {
    const thinkingMsg = {
      id: "2",
      role: "assistant",
      content: "<think>I am processing...",
    };

    render(
      <ChatMessage message={thinkingMsg} isLast={true} isLoading={true} />,
    );

    // 演进点：验证思考块的动态状态
    expect(await screen.findByTestId("thinking-indicator")).toBeInTheDocument();
  });

  it("handles empty message content gracefully", () => {
    const emptyMsg = { id: "3", role: "assistant", content: "" };
    const { container } = render(
      <ChatMessage message={emptyMsg} isLast={false} isLoading={false} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("handles malformed think tags correctly", async () => {
    const malformedMsg = {
      id: "4",
      role: "assistant",
      content: "<think>Normal message",
    };

    render(
      <ChatMessage message={malformedMsg} isLast={false} isLoading={false} />,
    );
    expect(await screen.findByTestId("thinking-block")).toHaveTextContent(
      "Normal message",
    );
  });

  /**
   * §3.7（批次 B4）：生成中只给这条消息挂 aria-busy，
   * 让辅助技术推迟呈现还在增长的内容；**不**挂 aria-live，
   * 否则逐字追加会被念几十遍。
   */
  it("marks the streaming message aria-busy and never aria-live", async () => {
    const streamingMsg = { id: "5", role: "assistant", content: "解释一下" };
    const { container, rerender } = render(
      <ChatMessage message={streamingMsg} isLast={true} isLoading={true} />,
    );

    const root = container.querySelector("#message-5") as HTMLElement;
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("[aria-live]")).toBeNull();

    rerender(
      <ChatMessage message={streamingMsg} isLast={true} isLoading={false} />,
    );
    expect(container.querySelector("#message-5")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("does not mark a finished or user message as busy", () => {
    const userMsg = { id: "6", role: "user", content: "问题" };
    const { container } = render(
      <ChatMessage message={userMsg} isLast={true} isLoading={true} />,
    );
    expect(container.querySelector("#message-6")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });
});
