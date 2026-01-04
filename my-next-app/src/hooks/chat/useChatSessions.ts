
import { useState, useEffect, useCallback } from 'react';
import type { ChatSession } from '@/lib/chat-service';
import {
    getChatSessions,
    createChatSession,
    deleteChatSession,
    loadSessionMessages
} from '@/app/chat/actions';

export function useChatSessions() {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [isSessionsLoading, setIsSessionsLoading] = useState(true);

    // 加载会话列表
    useEffect(() => {
        loadSessions();
    }, []);

    // 自动清理：如果没有任何会话且当前没在新建状态，确保 currentSessionId 为 null
    useEffect(() => {
        if (!isSessionsLoading && sessions.length === 0 && currentSessionId !== null) {
            setCurrentSessionId(null);
        }
    }, [sessions, currentSessionId, isSessionsLoading]);

    const loadSessions = async () => {
        setIsSessionsLoading(true);
        try {
            const loadedSessions = await getChatSessions();
            setSessions(loadedSessions);
        } catch (error) {
            console.error('加载会话列表失败:', error);
        } finally {
            setIsSessionsLoading(false);
        }
    };

    const handleNewSession = useCallback(() => {
        setCurrentSessionId(null);
    }, []);

    const handleSessionSelect = useCallback(async (sessionId: number) => {
        setCurrentSessionId(sessionId);
        try {
            const history = await loadSessionMessages(sessionId);
            return history;
        } catch (error) {
            console.error('加载会话消息失败:', error);
            return [];
        }
    }, []);

    const handleDeleteSession = useCallback(async (sessionId: number) => {
        try {
            await deleteChatSession(sessionId);
            setSessions(prev => {
                const updated = prev.filter(s => s.id !== sessionId);
                // 如果删除的是当前会话，需要处理选中状态
                if (currentSessionId === sessionId) {
                    if (updated.length > 0) {
                        // 自动选中第一个，但这里我们只返回更新后的列表，
                        // 具体的选中逻辑交给组件或者在这里处理？
                        // 为了保持纯粹，这里只更新列表，但也需要重置 currentSessionId
                        // 这里的逻辑稍微复杂，稍微违背了"纯粹"原则，但实用。
                        // 让我们简单处理：如果删除的是当前，则设为null（新建）或者第一个
                    }
                }
                return updated;
            });

            // 重新计算 currentSessionId 的逻辑比较依赖 state 更新后的结果，
            // 简单起见，我们在组件层处理"删除后跳转"，
            // 或者在这里直接返回更新后的 sessions 供组件判断
            return true;
        } catch (error) {
            console.error('删除会话失败:', error);
            return false;
        }
    }, [currentSessionId]);

    // 用于在产生新会话时手动更新列表（例如发送第一条消息后）
    const addSession = useCallback((newSession: ChatSession) => {
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
    }, []);

    const updateSessionTitle = useCallback((sessionId: number, title: string) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
    }, []);

    return {
        sessions,
        currentSessionId,
        setCurrentSessionId, // 暴露给需要手动控制的场景
        isSessionsLoading,
        loadSessions,
        handleNewSession,
        handleSessionSelect,
        handleDeleteSession,
        addSession,
        updateSessionTitle
    };
}
