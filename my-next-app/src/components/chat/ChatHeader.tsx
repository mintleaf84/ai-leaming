import React from 'react';
import { Bot, Menu, Trash2, X } from 'lucide-react';
import { ChatModeToggle, ChatMode } from './ChatModeToggle';

interface ChatHeaderProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    showFavorites: boolean;
    hasMessages: boolean;
    onClearChat: () => void;
    mode: ChatMode;
    setMode: (mode: ChatMode) => void;
}

export function ChatHeader({
    sidebarOpen,
    setSidebarOpen,
    showFavorites,
    hasMessages,
    onClearChat,
    mode,
    setMode
}: ChatHeaderProps) {
    return (
        <header className="bg-background border-b border-border px-4 md:px-6 py-3 flex items-center justify-between z-10 sticky top-0">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="md:hidden p-2 hover:bg-accent rounded-lg transition-colors"
                >
                    {sidebarOpen ? <X className="w-5 h-5 text-muted-foreground" /> : <Menu className="w-5 h-5 text-muted-foreground" />}
                </button>
                <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <Bot className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="text-base font-bold text-foreground">
                        {showFavorites ? '我的收藏' : 'AI 智能教研助手'}
                    </h1>
                    <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                        {showFavorites ? 'FAVORITES' : 'FETCH STREAM ENGINE'}
                    </p>
                </div>
            </div>

            {/* 模式切换与清空对话 */}
            <div className="flex items-center gap-2">
                {!showFavorites && <ChatModeToggle mode={mode} onModeChange={setMode} />}

                {hasMessages && (
                    <button
                        onClick={onClearChat}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>清空对话</span>
                    </button>
                )}
            </div>
        </header>
    );
}
