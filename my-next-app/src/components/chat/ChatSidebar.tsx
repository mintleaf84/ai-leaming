'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquarePlus, Trash2, MessageSquare, Star, Search, Loader2 } from 'lucide-react';
import type { ChatSession, SearchResult } from '@/lib/services/chat';
import { searchMessagesAction } from '@/app/chat/actions';

interface ChatSidebarProps {
    sessions: ChatSession[];
    currentSessionId: number | null;
    onSessionSelect: (sessionId: number, messageId?: number) => void;
    onNewSession: () => void;
    onDeleteSession: (sessionId: number) => void;
    showFavorites: boolean;
    onToggleShowFavorites: () => void;
}

/**
 * 聊天会话侧边栏
 * 显示历史会话列表，支持切换和删除
 */
export default function ChatSidebar({
    sessions,
    currentSessionId,
    onSessionSelect,
    onNewSession,
    onDeleteSession,
    showFavorites,
    onToggleShowFavorites,
}: ChatSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim()) {
                setIsSearching(true);
                try {
                    const results = await searchMessagesAction(searchQuery);
                    setSearchResults(results);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return '今天';
        if (days === 1) return '昨天';
        if (days < 7) return `${days} 天前`;
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    const highlightText = (text: string, query: string) => {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase() ?
                        <span key={i} className="bg-yellow-200 text-gray-900 font-medium">{part}</span> : part
                )}
            </span>
        );
    };

    return (
        <div className="w-64 h-full bg-card border-r border-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border space-y-3">
                <button
                    onClick={onNewSession}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                >
                    <MessageSquarePlus className="w-4 h-4" />
                    新建对话
                </button>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜索聊天记录..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-primary animate-spin" />
                    )}
                </div>
            </div>

            {/* Favorites Toggle */}
            <div className="px-4 pb-2 pt-2">
                <button
                    onClick={() => onToggleShowFavorites()}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showFavorites
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900'
                        : 'text-muted-foreground hover:bg-accent'
                        }`}
                >
                    <Star className={`w-4 h-4 ${showFavorites ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                    我的收藏
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {searchQuery ? (
                    // Search Results View
                    <div className="p-2 space-y-1">
                        {searchResults.length === 0 && !isSearching ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                <p>未找到相关内容</p>
                            </div>
                        ) : (
                            searchResults.map((result) => (
                                <button
                                    key={result.messageId}
                                    onClick={() => onSessionSelect(result.sessionId, result.messageId)}
                                    className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors group"
                                >
                                    <div className="font-medium text-sm text-foreground mb-1 truncate">
                                        {result.sessionTitle}
                                    </div>
                                    <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                        <span className={`inline-block px-1.5 py-0.5 rounded mr-1 ${result.role === 'user' ? 'bg-primary/10 text-primary' : 'bg-green-500/10 text-green-600'
                                            }`}>
                                            {result.role === 'user' ? '问' : '答'}
                                        </span>
                                        {highlightText(result.content, searchQuery)}
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground/70">
                                        {formatDate(result.created_at)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                ) : (
                    // Session List View
                    <>
                        {(sessions.length === 0 && currentSessionId === null) ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4 text-center">
                                <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                                <p className="text-sm">暂无历史对话</p>
                                <p className="text-xs mt-1">输入消息开始新对话</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {/* 临时会话占位 */}
                                {currentSessionId === null && (
                                    <div className="bg-card shadow-sm border border-primary/20 rounded-lg p-3 mb-2 animate-pulse">
                                        <div className="font-medium text-sm text-primary">新对话...</div>
                                        <div className="text-[10px] text-muted-foreground mt-1">等待发送第一条消息</div>
                                    </div>
                                )}
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={`group relative rounded-lg transition-all ${currentSessionId === session.id
                                            ? 'bg-card shadow-sm border border-primary/20'
                                            : 'hover:bg-accent'
                                            }`}
                                    >
                                        <button
                                            onClick={() => onSessionSelect(session.id)}
                                            className="w-full text-left px-3 py-2.5 pr-10"
                                        >
                                            <div className="font-medium text-sm text-foreground truncate">
                                                {session.title}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                <span>{formatDate(session.updated_at)}</span>
                                                <span>•</span>
                                                <span>{session.message_count} 条消息</span>
                                            </div>
                                        </button>

                                        {/* Delete Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm('确定要删除这个对话吗？')) {
                                                    onDeleteSession(session.id);
                                                }
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Tip */}
            <div className="p-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground text-center">
                    支持快捷指令: <code className="bg-background px-1 rounded border border-border">/quiz</code>{' '}
                    <code className="bg-background px-1 rounded border border-border">/explain</code>
                </p>
            </div>
        </div>
    );
}
