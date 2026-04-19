
import { useState, useCallback, useRef } from 'react';
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
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [enableRag, setEnableRag] = useState(false); // Default to false (User opt-in)
    const [mode, setMode] = useState<ChatMode>('standard');

    const abortControllerRef = useRef<AbortController | null>(null);

    // 核心：发送消息并处理流式响应
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isLoading) return;

        setLastFailedMessage(null);

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: content.trim(),
        };

        // 立即添加用户消息
        setMessages(prev => [...prev, userMessage]);
        setError(null);
        setIsLoading(true);

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
                setError('创建会话失败，请重试');
                setIsLoading(false);
                return;
            }
        }

        // 创建 AbortController 用于取消请求
        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
                    sessionId: sessionIdToUse,
                    enableRag,
                    mode
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                // 尝试解析服务器返回的错误信息
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = typeof errorData.error === 'string'
                            ? errorData.error
                            : errorData.error.message || errorData.message || errorMessage;
                    }
                } catch {
                    // 如果无法解析 JSON，使用默认错误消息
                }
                throw new Error(errorMessage);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // 创建助手消息占位
            const assistantMessageId = `assistant-${Date.now()}`;
            const assistantMessage: Message = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                is_favorite: 0,
            };
            setMessages(prev => [...prev, assistantMessage]);

            // 读取流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // 尝试解析 Vercel AI SDK 的文本协议 (0:"...")
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (line.startsWith('0:')) {
                        try {
                            const jsonStr = line.slice(2);
                            const text = JSON.parse(jsonStr);
                            accumulatedContent += text;
                        } catch (e) {
                            accumulatedContent += line.slice(2);
                        }
                    } else if (line.startsWith('e:') || line.startsWith('d:')) {
                        continue;
                    } else {
                        accumulatedContent += line;
                    }
                }

                // 更新消息内容
                setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent }
                        : m
                ));
            }

            // ✅ 优化：标题生成改为非阻塞（fire-and-forget）
            // 用户可以立即继续对话，无需等待标题生成完成
            if (isNewSession && !isGeneratingTitle && sessionIdToUse) {
                const targetSessionId = sessionIdToUse;
                // 使用 setTimeout 确保不阻塞主流程
                setTimeout(async () => {
                    setIsGeneratingTitle(true);
                    try {
                        const newTitle = await generateChatTitle(targetSessionId);
                        onTitleGenerated(targetSessionId, newTitle);
                    } catch (e) {
                        console.error('生成标题失败:', e);
                    } finally {
                        setIsGeneratingTitle(false);
                    }
                }, 100); // 延迟 100ms，确保 UI 先响应
            }

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                console.log('Request aborted');
            } else {
                console.error('Chat error:', err);
                setError(err instanceof Error ? err.message : '发送消息失败');
                setLastFailedMessage(content);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [messages, currentSessionId, isLoading, isGeneratingTitle, onNewSessionCreated, onTitleGenerated]);

    // 停止生成
    const stopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    }, []);

    // 重试上一条失败的消息
    const handleRetry = useCallback(() => {
        if (lastFailedMessage) {
            setError(null);
            // 移除失败时可能已添加的空助手消息
            setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content === '')));
            sendMessage(lastFailedMessage);
        }
    }, [lastFailedMessage, sendMessage]);

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
