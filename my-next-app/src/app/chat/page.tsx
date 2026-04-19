'use client';

import React, { useRef, useState, useCallback } from 'react';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { toast } from 'sonner';
import { toggleMessageFavoriteAction, getFavoriteMessagesAction } from '@/server/actions/chat';
import { useChatSessions } from '@/hooks/chat/use-chat-sessions';
import { useChatStream } from '@/hooks/chat/use-chat-stream';
import { useChatScroll } from '@/hooks/chat/use-chat-scroll';
import { KnowledgeModal } from '@/app/knowledge/components/KnowledgeModal';
import type { KnowledgeCard } from '@/lib/services/knowledge';

// New Components

import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatInput, ChatInputHandle } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { ChatMode } from '@/components/chat/ChatModeToggle';

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
        setEnableRag,
        mode,
        setMode
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
    const [showFavorites, setShowFavorites] = useState(false);

    // 知识卡片 Modal 状态
    const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
    const [currentCard, setCurrentCard] = useState<Partial<KnowledgeCard> | null>(null);

    const inputRef = useRef<ChatInputHandle>(null);

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
            toast.error('提取失败', {
                description: '无法从消息中提取知识卡片，请重试',
            });
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

            toast.success('保存成功', {
                description: '知识卡片已添加到知识库',
            });

        } catch (error) {
            console.error('保存失败:', error);
            toast.error('保存失败', {
                description: '无法保存知识卡片，请重试',
            });
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
    }, [showFavorites, resetSessionId, setMessages, handleNewSession]); // handleNewSession is now a dependency or should be wrapped? 
    // handleNewSession changes because it closes over state. Simplified: recursive dependency.
    // Ideally handleNewSession should be useCallback-ed, or just ignore for now as it's not crucial for this refactor.
    // Actually handleNewSession refs 'resetSessionId' etc which are from hooks.
    // Let's wrap handleNewSession in useCallback to be safe for deps.


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
                    onRenameSession={updateSessionTitle}
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

                <ChatHeader
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    showFavorites={showFavorites}
                    hasMessages={messages.length > 0}
                    onClearChat={handleClearChat}
                    mode={mode}
                    setMode={setMode}
                />

                <MessageList
                    messages={messages}
                    isLoading={isLoading}
                    error={error}
                    lastFailedMessage={lastFailedMessage}
                    onDeleteMessage={handleDeleteMessage}
                    onSaveToKnowledge={handleSaveToKnowledge}
                    onToggleFavorite={handleToggleFavorite}
                    onRetry={handleRetry}
                    messagesEndRef={messagesEndRef}
                />

                <ChatInput
                    ref={inputRef}
                    isLoading={isLoading}
                    showFavorites={showFavorites}
                    enableRag={enableRag}
                    setEnableRag={setEnableRag}
                    onSendMessage={sendMessage}
                    onStopGeneration={stopGeneration}
                />
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
