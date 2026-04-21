import { useState, useCallback, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { createChatSession, generateChatTitle } from '@/server/actions/chat';
import type { ChatSession } from '@/lib/services/chat';
import type { ChatMode } from '@/components/chat/ChatModeToggle';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    is_favorite?: number;
}

interface UseChatStreamProps {
    currentSessionId: number | null;
    onNewSessionCreated: (session: ChatSession) => void;
    onTitleGenerated: (sessionId: number, title: string) => void;
}

export function useChatStream({
    currentSessionId,
    onNewSessionCreated,
    onTitleGenerated
}: UseChatStreamProps) {
    const [localError, setLocalError] = useState<string | null>(null);
    const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [enableRag, setEnableRag] = useState(false); // Default to false (User opt-in)
    const [mode, setMode] = useState<ChatMode>('standard');
    const pendingTitleSessionIdRef = useRef<number | null>(null);

    const extractTextFromUiMessage = useCallback((message: UIMessage): string => {
        if (!Array.isArray(message.parts)) return '';

        return message.parts
            .map((part) => {
                const p = part as Record<string, unknown>;
                if (p.type === 'text' && typeof p.text === 'string') {
                    return p.text;
                }
                return '';
            })
            .join('');
    }, []);

    const toSimpleMessages = useCallback((uiMessages: UIMessage[]): Message[] => {
        return uiMessages.map((m) => ({
            id: m.id,
            role: m.role as Message['role'],
            content: extractTextFromUiMessage(m),
        }));
    }, [extractTextFromUiMessage]);

    const toUiMessages = useCallback((simpleMessages: Message[]): UIMessage[] => {
        return simpleMessages.map((m) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: 'text', text: m.content }],
        }));
    }, []);

    const {
        messages: uiMessages,
        status,
        error: chatError,
        sendMessage: sendChatMessage,
        stop,
        setMessages: setUiMessages,
    } = useChat({
        transport: new DefaultChatTransport({ api: '/api/chat' }),
        onFinish: ({ message }) => {
            const completedText = extractTextFromUiMessage(message);
            const targetSessionId = pendingTitleSessionIdRef.current;

            if (!targetSessionId || !completedText || isGeneratingTitle) {
                return;
            }

            setTimeout(async () => {
                setIsGeneratingTitle(true);
                try {
                    const newTitle = await generateChatTitle(targetSessionId);
                    onTitleGenerated(targetSessionId, newTitle);
                } catch (e) {
                    console.error('生成标题失败:', e);
                } finally {
                    setIsGeneratingTitle(false);
                    pendingTitleSessionIdRef.current = null;
                }
            }, 100);
        },
    });

    const messages = useMemo(() => toSimpleMessages(uiMessages), [uiMessages, toSimpleMessages]);
    const isLoading = status === 'submitted' || status === 'streaming';
    const error = localError || (chatError?.message ?? null);

    // 核心：发送消息并处理流式响应
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isLoading) return;

        setLastFailedMessage(null);
        setLocalError(null);

        let sessionIdToUse = currentSessionId;
        let isNewSession = false;

        // 如果没有当前会话，先创建一个
        if (sessionIdToUse === null) {
            try {
                const newId = await createChatSession();
                sessionIdToUse = newId;
                isNewSession = true;

                // 通知外部新会话创建
                onNewSessionCreated({
                    id: newId,
                    user_id: 0, // 将在服务端正确设置
                    title: '新对话',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    message_count: 0,
                });
            } catch (err) {
                console.error('创建会话失败:', err);
                setLocalError('创建会话失败，请重试');
                return;
            }
        }

        try {
            if (isNewSession && sessionIdToUse) {
                pendingTitleSessionIdRef.current = sessionIdToUse;
            }

            await sendChatMessage(
                { text: content.trim() },
                {
                    body: {
                    sessionId: sessionIdToUse,
                    enableRag,
                    mode
                    }
                }
            );

        } catch (err: unknown) {
            if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
                console.log('Request aborted');
            } else {
                console.error('Chat error:', err);
                setLocalError(err instanceof Error ? err.message : '发送消息失败');
                setLastFailedMessage(content);
            }
        }
    }, [currentSessionId, isLoading, onNewSessionCreated, enableRag, mode, sendChatMessage]);

    // 停止生成
    const stopGeneration = useCallback(() => {
        stop();
    }, [stop]);

    // 重试上一条失败的消息
    const handleRetry = useCallback(() => {
        if (lastFailedMessage) {
            setLocalError(null);
            sendMessage(lastFailedMessage);
        }
    }, [lastFailedMessage, sendMessage]);

    const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
        setUiMessages((prevUi) => {
            const prevSimple = toSimpleMessages(prevUi);
            const nextSimple = typeof updater === 'function'
                ? updater(prevSimple)
                : updater;
            return toUiMessages(nextSimple);
        });
    }, [setUiMessages, toSimpleMessages, toUiMessages]);

    const setError = useCallback((nextError: string | null) => {
        setLocalError(nextError);
    }, []);

    return {
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
    };
}
