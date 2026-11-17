import React from "react";
import { Bot, RotateCcw } from "lucide-react";
import ChatMessage from "./ChatMessage";
import { Message } from "@/hooks/chat/use-chat-stream";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  lastFailedMessage: string | null;
  onDeleteMessage: (id: string) => void;
  onSaveToKnowledge: (content: string) => void | Promise<void>;
  onToggleFavorite: (id: number, isFav: boolean) => void | Promise<void>;
  onRetry: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({
  messages,
  isLoading,
  error,
  lastFailedMessage,
  onDeleteMessage,
  onSaveToKnowledge,
  onToggleFavorite,
  onRetry,
  messagesEndRef,
}: MessageListProps) {
  // 流式回答的"声音"（docs/ux-a11y-audit.md §3.7）。
  // 正文逐字增长**不能**放进 live 区域：那会让屏幕阅读器把每个字念一遍、几十次打断，
  // 比不播报更糟。所以这里只在"开始生成 / 失败 / 完成"三档各播一次整句，
  // 正文容器只挂 aria-busy 告诉辅助技术"内容还在变，先别念"。
  //
  // 文本直接从 props 推导（不存 state、不进 effect）：isLoading 一变父组件就重渲染，
  // 文本随之变化即触发播报；文本没变（无关重渲染）就不会重复念。
  const announcement =
    messages.length === 0
      ? ""
      : isLoading
        ? "AI 正在生成回答…"
        : error
          ? "回答生成失败，可以使用重试按钮重新发送。"
          : "回答已完成。";

  return (
    <main className="flex-1 overflow-y-auto px-4 py-8 md:px-0 scrollbar-thin">
      {/* role="status" 自带 aria-live="polite" + aria-atomic="true"：
          文本整句替换时读出整句，而不是只读差量 */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="max-w-3xl mx-auto space-y-8" aria-busy={isLoading}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/30">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              你可以问我任何关于教育心理学或教师招聘的问题
            </p>
            <div className="mt-6 space-y-2 text-xs text-muted-foreground/80">
              <p>💡 试试这些快捷指令：</p>
              <code className="block bg-muted px-3 py-1 rounded">
                /quiz 教育学基础
              </code>
              <code className="block bg-muted px-3 py-1 rounded">
                /explain 认知发展理论
              </code>
            </div>
          </div>
        )}

        {messages.map((m, index) => (
          <ChatMessage
            key={m.id}
            message={m}
            isLast={index === messages.length - 1}
            isLoading={
              isLoading &&
              index === messages.length - 1 &&
              m.role === "assistant"
            }
            onDelete={() => onDeleteMessage(m.id)}
            onSaveToKnowledge={onSaveToKnowledge}
            onToggleFavorite={onToggleFavorite}
          />
        ))}

        {/* 错误提示及重试按钮 */}
        {error && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="bg-destructive/10 text-destructive text-xs px-4 py-2 rounded-lg border border-destructive/20">
              无法连接到 AI 服务: {error}
            </div>
            {lastFailedMessage && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重试</span>
              </button>
            )}
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>
    </main>
  );
}

MessageList.displayName = "MessageList";
