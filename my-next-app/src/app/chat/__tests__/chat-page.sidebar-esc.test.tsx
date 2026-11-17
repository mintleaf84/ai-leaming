/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";

/**
 * 批次 B5：会话页移动端遮罩原本是 `div onClick`，键盘用户关不掉侧栏。
 *
 * 处置（第 2 类）：遮罩退化为纯鼠标便捷入口（tabIndex=-1 + aria-hidden），
 * 关闭路径补 Esc（挂 document），且输入框内的 Esc 仍归输入框自己（重命名取消），
 * 同一次按键只做一件事。
 */

vi.mock("@/server/actions/chat", () => ({
  toggleMessageFavoriteAction: vi.fn(),
  getFavoriteMessagesAction: vi.fn(),
}));

vi.mock("@/hooks/chat/use-chat-sessions", () => ({
  useChatSessions: () => ({
    sessions: [],
    currentSessionId: null,
    sessionsError: null,
    loadSessions: vi.fn(),
    handleNewSession: vi.fn(),
    handleSessionSelect: vi.fn(),
    handleDeleteSession: vi.fn(),
    addSession: vi.fn(),
    updateSessionTitle: vi.fn(),
  }),
}));

vi.mock("@/hooks/chat/use-chat-stream", () => ({
  useChatStream: () => ({
    messages: [],
    setMessages: vi.fn(),
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    handleRetry: vi.fn(),
    lastFailedMessage: null,
    setError: vi.fn(),
    setLastFailedMessage: vi.fn(),
    enableRag: false,
    setEnableRag: vi.fn(),
    mode: "smart",
    setMode: vi.fn(),
  }),
}));

vi.mock("@/hooks/chat/use-chat-scroll", () => ({
  useChatScroll: () => ({
    messagesEndRef: { current: null },
    setTargetMessageId: vi.fn(),
    scrollToBottom: vi.fn(),
  }),
}));

vi.mock("@/components/chat/ChatSidebar", () => ({
  default: () => (
    <div data-testid="chat-sidebar">
      <input aria-label="会话名称" />
    </div>
  ),
}));
vi.mock("@/components/chat/ChatHeader", () => ({
  ChatHeader: () => <div data-testid="chat-header" />,
}));
vi.mock("@/components/chat/ChatInput", () => ({
  ChatInput: React.forwardRef(function MockChatInput() {
    return <div data-testid="chat-input" />;
  }),
}));
vi.mock("@/components/chat/MessageList", () => ({
  MessageList: () => <div data-testid="chat-message-list" />,
}));
vi.mock("@/app/knowledge/components/KnowledgeModal", () => ({
  KnowledgeModal: () => null,
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ChatPage from "../page";

const overlay = () =>
  document.querySelector(".bg-black\\/20") as HTMLElement | null;

describe("会话页移动端侧栏键盘路径（批次 B5）", () => {
  it("遮罩不进 Tab 序，点击仍能关闭侧栏（鼠标路径不变）", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    const scrim = overlay();
    expect(scrim).not.toBeNull();
    expect(scrim).toHaveAttribute("tabindex", "-1");
    expect(scrim).toHaveAttribute("aria-hidden", "true");

    await user.click(scrim!);
    expect(overlay()).toBeNull();
    // 侧栏容器退回屏幕外（合法状态）
    expect(screen.getByTestId("chat-sidebar").parentElement).toHaveClass(
      "-translate-x-full",
    );
  });

  it("Esc 关闭侧栏（改造前键盘用户没有路径）", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    expect(overlay()).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(overlay()).toBeNull();
  });

  it("焦点在输入框时 Esc 不关侧栏（交给输入框自己处理，如取消重命名）", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByRole("textbox", { name: "会话名称" }));
    await user.keyboard("{Escape}");

    // 侧栏仍开着：同一次按键只做一件事
    expect(overlay()).not.toBeNull();
  });
});
