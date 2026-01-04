'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, Loader2, StopCircle, Bot, Menu, X, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChatMessage from '@/components/chat/ChatMessage';
import { KnowledgeModal } from '@/app/knowledge/components/KnowledgeModal';
import type { KnowledgeCard } from '@/lib/services/knowledge';
import { useToast } from '@/components/ui/use-toast';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { toggleMessageFavoriteAction, getFavoriteMessagesAction } from './actions';
import { useChatSessions } from '@/hooks/chat/useChatSessions';
import { useChatStream } from '@/hooks/chat/useChatStream';
import { useChatScroll } from '@/hooks/chat/useChatScroll';

// 快捷指令定义
const COMMANDS = [
    { command: '/quiz', description: '生成练习题', example: '/quiz 教育学基础' },
    { command: '/explain', description: '解释概念', example: '/explain 认知发展理论' },
];

export default function ChatPage() {
    // 1. Hooks 初始化
    const {
        sessions,
        currentSessionId,
        loadSessions,
        handleNewSession: resetSessionId,
        handleSessionSelect: selectSession,
        handleDeleteSession,
        addSession,
        updateSessionTitle
    } = useChatSessions();

    const {
        messages,
        setMessages,
        isLoading,
        error,
        sendMessage,
        stopGeneration,
        handleRetry,
        lastFailedMessage,
        setError,
        setLastFailedMessage,
        enableRag,
        setEnableRag
    } = useChatStream({
        currentSessionId,
        onNewSessionCreated: addSession,
        onTitleGenerated: updateSessionTitle
    });

    const {
        messagesEndRef,
        setTargetMessageId,
        scrollToBottom
    } = useChatScroll({ messagesLength: messages.length });

    // 2. 本地 UI 状态
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [inputValue, setInputValue] = useState('');
    const [showFavorites, setShowFavorites] = useState(false);

    // 知识卡片 Modal 状态
    const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
    const [currentCard, setCurrentCard] = useState<Partial<KnowledgeCard> | null>(null);
    const { toast } = useToast();

    // 快捷指令状态
    const [showCommands, setShowCommands] = useState(false);
    const [filteredCommands, setFilteredCommands] = useState(COMMANDS);

    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 3. 业务逻辑组合

    // 处理新建会话
    const handleNewSession = async () => {
        resetSessionId();
        setMessages([]);
        setError(null);
        setLastFailedMessage(null);
        setShowFavorites(false);
        inputRef.current?.focus();
    };

    // 处理会话选择与跳转
    const handleSessionSelect = async (sessionId: number, messageId?: number) => {
        // 先切换会话并加载消息
        const history = await selectSession(sessionId);
        setMessages(history.map(msg => ({
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
            is_favorite: msg.is_favorite,
        })));

        setShowFavorites(false);
        setError(null);
        setLastFailedMessage(null);

        // 如果有目标消息，设置跳转状态
        if (messageId) {
            setTargetMessageId(messageId);
        } else {
            // 普通切换，稍微延迟滚动到底部（等待渲染）
            setTimeout(scrollToBottom, 100);
        }
    };

    // 处理清除对话
    const handleClearChat = useCallback(() => {
        if (confirm('确定要清空当前对话的所有消息吗？')) {
            setMessages([]);
            setError(null);
            setLastFailedMessage(null);
        }
    }, [setMessages, setError, setLastFailedMessage]);

    // 处理删除消息
    const handleDeleteMessage = useCallback((messageId: string) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    }, [setMessages]);

    // 处理保存知识卡片（第一步：提取并预览）
    const handleSaveToKnowledge = useCallback(async (content: string) => {
        try {
            // 显示加载状态（这里可以通过其他方式优化，暂时依赖 ChatMessage 的按钮 loading）
            const response = await fetch('/api/knowledge/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    sessionId: currentSessionId,
                    save: false, // 只预览
                }),
            });

            if (!response.ok) {
                throw new Error('提取知识卡片失败');
            }

            const data = await response.json();
            console.log('知识卡片预览:', data);

            // 打开 Modal
            setCurrentCard({
                ...data.card,
                session_id: currentSessionId,
                source_content: content,
                suggestions: data.suggestions // 传递建议
            });
            setKnowledgeModalOpen(true);

        } catch (error) {
            console.error('Failed to extract card:', error);
            // 这里最好有个 Toast 提示失败，暂时忽略
        }
    }, [currentSessionId]);

    // 实际保存卡片（UI 回调）
    const handleActualSave = async () => {
        if (!currentCard) return;

        try {
            const response = await fetch('/api/knowledge/cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentCard),
            });

            if (!response.ok) throw new Error('保存失败');

            setKnowledgeModalOpen(false);
            setCurrentCard(null);

            // 可以触发一个全局 Toast
            // alert('保存成功'); // 临时替代

        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败，请重试');
        }
    };

    // 处理消息收藏
    const handleToggleFavorite = useCallback(async (messageId: number, isFavorite: boolean) => {
        const res = await toggleMessageFavoriteAction(messageId, isFavorite);
        if (res.success) {
            setMessages(prev => prev.map(m => {
                const numericId = parseInt(m.id.replace('assistant-', ''));
                if (numericId === messageId) {
                    return { ...m, is_favorite: isFavorite ? 1 : 0 };
                }
                return m;
            }));
        }
    }, [setMessages]);

    // 处理收藏夹视图切换
    const handleToggleShowFavorites = useCallback(async () => {
        const nextState = !showFavorites;
        setShowFavorites(nextState);
        if (nextState) {
            resetSessionId(); // 清除当前会话ID引用
            const favorites = await getFavoriteMessagesAction();
            setMessages(favorites.map(msg => ({
                id: `assistant-${msg.id}`,
                role: msg.role,
                content: msg.content,
                is_favorite: msg.is_favorite,
            })));
        } else {
            handleNewSession();
        }
    }, [showFavorites, resetSessionId, setMessages]); // handleNewSession is wrapping resetSessionId, simplified here

    // 处理快捷指令输入
    useEffect(() => {
        if (inputValue.startsWith('/')) {
            const query = inputValue.toLowerCase();
            const filtered = COMMANDS.filter(cmd => cmd.command.startsWith(query));
            setFilteredCommands(filtered);
            setShowCommands(filtered.length > 0);
        } else {
            setShowCommands(false);
        }
    }, [inputValue]);

    const selectCommand = useCallback((command: string) => {
        setInputValue(command + ' ');
        setShowCommands(false);
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(inputValue);
        setInputValue(''); // 提交后清空，sendMessage 已处理消息添加
    };

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <div
                className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    } fixed left-0 top-0 h-full z-30 transition-transform md:relative md:translate-x-0 border-r border-border bg-card`}
            >
                <ChatSidebar
                    sessions={sessions}
                    currentSessionId={currentSessionId}
                    onSessionSelect={handleSessionSelect}
                    onNewSession={handleNewSession}
                    onDeleteSession={handleDeleteSession}
                    showFavorites={showFavorites}
                    onToggleShowFavorites={handleToggleShowFavorites}
                />
            </div>

            {/* Overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Chat Area */}
            <div className="flex flex-col flex-1 min-w-0 bg-background">
                {/* Header */}
                <header className="bg-background border-b border-border px-6 py-3 flex items-center justify-between z-10 sticky top-0">
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

                    {/* 清空对话按钮 */}
                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>清空对话</span>
                        </button>
                    )}
                </header>

                {/* Messages Area */}
                <main className="flex-1 overflow-y-auto px-4 py-8 md:px-0 scrollbar-thin">
                    <div className="max-w-3xl mx-auto space-y-8">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/30">
                                <Bot className="w-12 h-12 mb-4 opacity-50" />
                                <p className="text-sm text-muted-foreground">你可以问我任何关于教育心理学或教师招聘的问题</p>
                                <div className="mt-6 space-y-2 text-xs text-muted-foreground/80">
                                    <p>💡 试试这些快捷指令：</p>
                                    <code className="block bg-muted px-3 py-1 rounded">/quiz 教育学基础</code>
                                    <code className="block bg-muted px-3 py-1 rounded">/explain 认知发展理论</code>
                                </div>
                            </div>
                        )}

                        {messages.map((m, index) => (
                            <ChatMessage
                                key={m.id}
                                message={m}
                                isLast={index === messages.length - 1}
                                isLoading={isLoading && index === messages.length - 1 && m.role === 'assistant'}
                                onDelete={() => handleDeleteMessage(m.id)}
                                onSaveToKnowledge={handleSaveToKnowledge}
                                onToggleFavorite={handleToggleFavorite}
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
                                        onClick={handleRetry}
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

                {/* Input Area */}
                <footer className="p-6 bg-gradient-to-t from-background via-background to-transparent sticky bottom-0 z-20">
                    <div className="max-w-3xl mx-auto relative group">
                        {/* 快捷指令自动补全 */}
                        {showCommands && (
                            <div className="absolute bottom-full mb-2 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-10">
                                {filteredCommands.map(cmd => (
                                    <button
                                        key={cmd.command}
                                        onClick={() => selectCommand(cmd.command)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                                    >
                                        <code className="text-sm font-mono text-primary">{cmd.command}</code>
                                        <span className="text-xs text-muted-foreground">{cmd.description}</span>
                                        <span className="text-xs text-muted-foreground/50 ml-auto">{cmd.example}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* 工具栏与提示 */}
                        <div className="flex justify-between items-center mb-2 px-1">
                            <div className="text-xs text-muted-foreground/50">
                                {showFavorites ? '' : '支持 Shift + Enter 换行'}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs transition-colors ${enableRag ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                    {enableRag ? '知识库增强已启用' : '知识库增强已关闭'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setEnableRag(!enableRag)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${enableRag ? 'bg-primary' : 'bg-input'
                                        }`}
                                >
                                    <span
                                        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${enableRag ? 'translate-x-4' : 'translate-x-0'
                                            }`}
                                    />
                                </button>
                            </div>
                        </div>

                        <form
                            onSubmit={handleSubmit}
                            className="relative flex items-end gap-2 bg-muted/50 border border-input rounded-2xl p-2 pl-4 focus-within:bg-background focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all duration-300 shadow-sm"
                        >
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                                    setInputValue(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (inputValue.trim() && !isLoading) {
                                            handleSubmit(e); // 复用 handleSubmit
                                        }
                                    }
                                    // 按 Tab 选择第一个指令
                                    if (e.key === 'Tab' && showCommands && filteredCommands.length > 0) {
                                        e.preventDefault();
                                        selectCommand(filteredCommands[0].command);
                                    }
                                    // 按 Esc 关闭指令列表
                                    if (e.key === 'Escape') {
                                        setShowCommands(false);
                                    }
                                }}
                                placeholder={showFavorites ? "收藏夹模式下无法发送消息" : "输入问题，Shift + Enter 换行，输入 / 查看指令..."}
                                className="flex-1 max-h-[200px] py-3 bg-transparent border-none focus:ring-0 text-sm resize-none scrollbar-hide font-medium text-foreground placeholder:text-muted-foreground"
                                rows={1}
                                disabled={isLoading || showFavorites}
                            />

                            <div className="pb-1 pr-1">
                                {isLoading ? (
                                    <Button
                                        type="button"
                                        onClick={stopGeneration}
                                        variant="destructive"
                                        size="icon"
                                        data-testid="stop-button"
                                        className="h-10 w-10 rounded-xl shrink-0 shadow-lg shadow-destructive/20"
                                    >
                                        <StopCircle className="w-5 h-5" />
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        disabled={!inputValue || !inputValue.trim() || showFavorites}
                                        size="icon"
                                        data-testid="send-button"
                                        className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                                    >
                                        <Send className="w-5 h-5" />
                                    </Button>
                                )}
                            </div>
                        </form>

                        {isLoading && (
                            <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                                <span className="bg-background/90 backdrop-blur text-[10px] font-bold text-primary px-3 py-1 rounded-full shadow-sm border border-border flex items-center gap-2 animate-bounce">
                                    <Loader2 className="w-3 h-3 animate-spin" /> AI THINKING
                                </span>
                            </div>
                        )}
                    </div>
                </footer>
            </div>
            {/* Knowledge Card Modal */}
            <KnowledgeModal
                isOpen={knowledgeModalOpen}
                isCreate={true}
                card={currentCard}
                onClose={() => setKnowledgeModalOpen(false)}
                onSave={handleActualSave}
                onChange={(newCard) => setCurrentCard({ ...currentCard, ...newCard })}
            />
        </div>
    );
}
