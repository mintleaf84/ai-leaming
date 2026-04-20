import React, { useState, useRef, useEffect } from 'react';
import { MessageSquarePlus, Search, Loader2, Star, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import { _cn } from '@/lib/utils';
import { useTerminology } from '@/lib/hooks/use-terminology';
import { renameChatSessionAction } from '@/server/actions/chat';

interface ChatSidebarProps {
    sessions: unknown[];
    currentSessionId: number | null;
    onSessionSelect: (sessionId: number, messageId?: number) => void;
    onNewSession: () => void;
    onDeleteSession: (sessionId: number) => void;
    onRenameSession?: (sessionId: number, newTitle: string) => void;
    showFavorites: boolean;
    onToggleShowFavorites: () => void;
}

// 日期格式化
const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const highlightText = (text: string, query: string) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ?
                    <span key={i} className="text-primary font-bold bg-primary/10 rounded px-0.5">{part}</span> :
                    part
            )}
        </span>
    );
};

/** 单条会话条目（含内联重命名） */
function SessionItem({
    session,
    isActive,
    onSelect,
    onDelete,
    onRename,
}: {
    session: unknown;
    isActive: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onRename: (newTitle: string) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(session.title);
    const inputRef = useRef<HTMLInputElement>(null);

    // 进入编辑模式时聚焦输入框
    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const commitRename = () => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== session.title) {
            onRename(trimmed);
        }
        setIsEditing(false);
    };

    const cancelRename = () => {
        setEditValue(session.title);
        setIsEditing(false);
    };

    return (
        <div
            className={`group relative rounded-lg transition-all ${isActive
                ? 'bg-card shadow-sm border border-primary/20'
                : 'hover:bg-accent'
                }`}
        >
            {isEditing ? (
                // 内联编辑态
                <div className="flex items-center gap-1 px-2 py-2">
                    <input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') cancelRename();
                        }}
                        className="flex-1 min-w-0 text-sm bg-background border border-primary/40 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        maxLength={40}
                    />
                    <button onClick={commitRename} className="p-1 text-primary hover:bg-primary/10 rounded" aria-label="确认">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={cancelRename} className="p-1 text-muted-foreground hover:bg-accent rounded" aria-label="取消">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                // 正常显示态
                <button
                    onClick={onSelect}
                    className="w-full text-left px-3 py-2.5 pr-16"
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
            )}

            {/* 操作按钮组（悬停显示） */}
            {!isEditing && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                        aria-label="重命名会话"
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditValue(session.title);
                            setIsEditing(true);
                        }}
                        className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                        aria-label="删除会话"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('确定要删除这个对话吗？')) {
                                onDelete();
                            }
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}

export default function ChatSidebar({
    sessions,
    currentSessionId,
    onSessionSelect,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    showFavorites,
    onToggleShowFavorites,
}: ChatSidebarProps) {
    const { t } = useTerminology();
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, _setIsSearching] = useState(false);
    const [searchResults, _setSearchResults] = useState<unknown[]>([]);

    // 执行重命名（调用服务端 Action 并通知父组件）
    const handleRename = async (sessionId: number, newTitle: string) => {
        const result = await renameChatSessionAction(sessionId, newTitle);
        if (result.success && onRenameSession) {
            onRenameSession(sessionId, result.title ?? newTitle);
        }
    };

    return (
        <div className="w-64 h-full bg-sidebar border-r border-border flex flex-col">
            {/* 头部 */}
            <div className="p-4 border-b border-border space-y-3">
                <button
                    onClick={onNewSession}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                >
                    <MessageSquarePlus className="w-4 h-4" />
                    {t('chat.new')}
                </button>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t('chat.search')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-primary animate-spin" />
                    )}
                </div>
            </div>

            {/* 收藏切换 */}
            <div className="px-4 pb-2 pt-2">
                <button
                    onClick={() => onToggleShowFavorites()}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showFavorites
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900'
                        : 'text-muted-foreground hover:bg-accent'
                        }`}
                >
                    <Star className={`w-4 h-4 ${showFavorites ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                    {t('chat.favorites')}
                </button>
            </div>

            {/* 会话列表 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {searchQuery ? (
                    // 搜索结果视图
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
                    // 会话列表视图
                    <>
                        {(sessions.length === 0 && currentSessionId === null) ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4 text-center">
                                <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                                <p className="text-sm">{t('chat.empty')}</p>
                                <p className="text-xs mt-1">{t('chat.start_tip')}</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {/* 临时会话占位 */}
                                {currentSessionId === null && (
                                    <div className="bg-card shadow-sm border border-primary/20 rounded-lg p-3 mb-2 animate-pulse">
                                        <div className="font-medium text-sm text-primary">{t('chat.new')}...</div>
                                        <div className="text-[10px] text-muted-foreground mt-1">{t('chat.start_tip')}</div>
                                    </div>
                                )}
                                {sessions.map((session) => (
                                    <SessionItem
                                        key={session.id}
                                        session={session}
                                        isActive={currentSessionId === session.id}
                                        onSelect={() => onSessionSelect(session.id)}
                                        onDelete={() => onDeleteSession(session.id)}
                                        onRename={(newTitle) => handleRename(session.id, newTitle)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 底部提示 */}
            <div className="p-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground text-center">
                    支持快捷指令: <code className="bg-background px-1 rounded border border-border">/quiz</code>{' '}
                    <code className="bg-background px-1 rounded border border-border">/explain</code>
                </p>
            </div>
        </div>
    );
}
