'use server';
import logger from '@/lib/logger';

import { createSession, getRecentMessages, updateSessionTitle, listSessions, getSession, deleteSession, getSessionMessages } from '@/lib/services/chat';
import { generateTextWrapper } from '@/lib/ai/client';
import { parseCommand, handleQuizCommand, handleExplainCommand, searchKnowledgeBase } from '@/lib/services/chat-rag';
import { requireUser } from '@/lib/auth/auth';

/**
 * 聊天功能 Server Actions
 */

/**
 * 创建新的聊天会话
 */
export async function createChatSession(): Promise<number> {
    try {
        const user = await requireUser();
        const sessionId = createSession(user.id, '新对话');
        return sessionId;
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 创建会话失败');
        throw new Error('创建会话失败');
    }
}

/**
 * 获取所有会话列表
 */
export async function getChatSessions() {
    try {
        const user = await requireUser();
        return listSessions(user.id, 50);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 获取会话列表失败');
        return [];
    }
}

/**
 * 获取单个会话详情
 */
export async function getChatSession(sessionId: number) {
    try {
        const user = await requireUser();
        return getSession(user.id, sessionId);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 获取会话详情失败');
        return null;
    }
}

/**
 * AI 自动生成会话标题
 * 基于会话的前几条消息内容
 */
export async function generateChatTitle(sessionId: number): Promise<string> {
    try {
        const user = await requireUser();
        const messages = getRecentMessages(user.id, sessionId, 6);

        if (messages.length === 0) {
            return '新对话';
        }

        // 构建上下文
        const context = messages
            .reverse()
            .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 100)}`)
            .join('\n');

        const prompt = `基于以下对话内容，生成一个简洁的对话标题（不超过10个字，不要使用引号）：

${context}

标题：`;

        const { text } = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
            timeout: 10000,
            retries: 1,
        });

        const title = text.trim().replace(/^["']|["']$/g, '').substring(0, 20) || '新对话';

        // 更新数据库
        updateSessionTitle(user.id, sessionId, title);

        return title;
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 生成标题失败');
        return '新对话';
    }
}

/**
 * 处理用户输入的快捷指令
 * 如果是指令，直接返回结果；否则返回 null，表示应走正常聊天流程
 */
export async function handleChatCommand(input: string): Promise<string | null> {
    const { type, keyword } = parseCommand(input);

    if (type === 'none') {
        return null; // 不是指令，走正常流程
    }

    try {
        if (type === 'quiz') {
            return await handleQuizCommand(keyword);
        } else if (type === 'explain') {
            return await handleExplainCommand(keyword);
        }
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 指令处理失败');
        return '抱歉，指令执行失败，请稍后重试。';
    }

    return null;
}

/**
 * 重命名聊天会话
 */
export async function renameChatSessionAction(sessionId: number, newTitle: string) {
    try {
        const user = await requireUser();
        const title = newTitle.trim() || '新对话';
        updateSessionTitle(user.id, sessionId, title);
        return { success: true, title };
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 重命名会话失败');
        return { success: false };
    }
}

/**
 * 删除会话
 */
export async function deleteChatSession(sessionId: number) {
    try {
        const user = await requireUser();
        deleteSession(user.id, sessionId);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 删除会话失败');
    }
}

/**
 * 加载会话消息
 */
export async function loadSessionMessages(sessionId: number) {
    try {
        const user = await requireUser();
        return getSessionMessages(user.id, sessionId);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 加载消息失败');
        return [];
    }
}

/**
 * 检索题库内容（供前端调用）
 */
export async function searchQuestions(query: string) {
    try {
        const context = await searchKnowledgeBase(query, 5);
        return context;
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 题库检索失败');
        return null;
    }
}

/**
 * 切换消息收藏状态
 */
export async function toggleMessageFavoriteAction(messageId: number, isFavorite: boolean) {
    try {
        const user = await requireUser();
        const { toggleMessageFavorite } = await import('@/lib/services/chat');
        toggleMessageFavorite(user.id, messageId, isFavorite);
        return { success: true };
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 切换收藏失败');
        return { success: false };
    }
}

/**
 * 获取收藏的消息列表
 */
export async function getFavoriteMessagesAction() {
    try {
        const user = await requireUser();
        const { getFavoriteMessages } = await import('@/lib/services/chat');
        return getFavoriteMessages(user.id);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 获取收藏失败');
        return [];
    }
}

/**
 * 搜索聊天记录
 */
export async function searchMessagesAction(query: string) {
    try {
        const user = await requireUser();
        const { searchMessages } = await import('@/lib/services/chat');
        return searchMessages(user.id, query);
    } catch (error) {
        logger.error({ err: error }, '[ChatActions] 搜索失败');
        return [];
    }
}
