import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 之前可用
const { mockPrepare, mockRun, mockGet, mockAll } = vi.hoisted(() => {
    const mockRun = vi.fn();
    const mockGet = vi.fn();
    const mockAll = vi.fn();
    const mockPrepare = vi.fn(() => ({
        run: mockRun,
        get: mockGet,
        all: mockAll,
    }));
    return { mockPrepare, mockRun, mockGet, mockAll };
});

// Mock db 模块
vi.mock('@/lib/db', () => ({
    default: {
        prepare: mockPrepare,
    },
}));

// 导入被测试的模块（必须在 mock 之后）
import {
    createSession,
    saveMessage,
    getSessionMessages,
    listSessions,
    deleteSession,
    updateSessionTitle,
    getSession,
    toggleMessageFavorite,
    getFavoriteMessages,
    searchMessages,
} from '@/lib/services/chat';

describe('ChatService', () => {
    const TEST_USER_ID = 1;

    beforeEach(() => {
        // 重置所有 mock
        vi.clearAllMocks();
    });

    describe('createSession', () => {
        it('应该创建新会话并返回 ID', () => {
            // 准备
            mockRun.mockReturnValue({ lastInsertRowid: 42 });

            // 执行
            const id = createSession(TEST_USER_ID, '新对话');

            // 验证
            expect(id).toBe(42);
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_sessions'));
            expect(mockRun).toHaveBeenCalledWith(TEST_USER_ID, '新对话');
        });

        it('应该使用默认标题', () => {
            mockRun.mockReturnValue({ lastInsertRowid: 1 });

            createSession(TEST_USER_ID);

            expect(mockRun).toHaveBeenCalledWith(TEST_USER_ID, '新对话');
        });
    });

    describe('saveMessage', () => {
        it('应该保存消息并更新会话', () => {
            // 准备 - 模拟会话存在
            mockGet.mockReturnValue({ id: 1 });
            mockRun.mockReturnValue({ lastInsertRowid: 100 });

            // 执行
            const msgId = saveMessage(TEST_USER_ID, 1, 'user', 'Hello');

            // 验证
            expect(msgId).toBe(100);
            // 验证权限检查
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM chat_sessions'));
            // 验证消息插入
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_messages'));
            // 验证会话更新
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions'));
        });

        it('会话不存在时应该抛出错误', () => {
            // 准备 - 模拟会话不存在
            mockGet.mockReturnValue(undefined);

            // 执行 & 验证
            expect(() => saveMessage(TEST_USER_ID, 999, 'user', 'Hello'))
                .toThrow('Unauthorized or session not found');
        });
    });

    describe('getSessionMessages', () => {
        it('应该返回会话的所有消息', () => {
            // 准备
            const mockMessages = [
                { id: 1, session_id: 1, role: 'user', content: 'Hello', is_favorite: 0, created_at: '2024-01-01' },
                { id: 2, session_id: 1, role: 'assistant', content: 'Hi!', is_favorite: 0, created_at: '2024-01-01' },
            ];
            mockAll.mockReturnValue(mockMessages);

            // 执行
            const messages = getSessionMessages(TEST_USER_ID, 1);

            // 验证
            expect(messages).toEqual(mockMessages);
            expect(mockAll).toHaveBeenCalledWith(1, TEST_USER_ID);
        });
    });

    describe('listSessions', () => {
        it('应该返回用户的会话列表', () => {
            // 准备
            const mockSessions = [
                { id: 1, title: '会话1', message_count: 5 },
                { id: 2, title: '会话2', message_count: 3 },
            ];
            mockAll.mockReturnValue(mockSessions);

            // 执行
            const sessions = listSessions(TEST_USER_ID);

            // 验证
            expect(sessions).toEqual(mockSessions);
            expect(mockAll).toHaveBeenCalledWith(TEST_USER_ID, 50); // 默认 limit
        });

        it('应该支持自定义 limit', () => {
            mockAll.mockReturnValue([]);

            listSessions(TEST_USER_ID, 10);

            expect(mockAll).toHaveBeenCalledWith(TEST_USER_ID, 10);
        });
    });

    describe('getSession', () => {
        it('应该返回指定会话', () => {
            const mockSession = { id: 1, title: '测试会话', message_count: 5 };
            mockGet.mockReturnValue(mockSession);

            const session = getSession(TEST_USER_ID, 1);

            expect(session).toEqual(mockSession);
        });

        it('会话不存在时应该返回 null', () => {
            mockGet.mockReturnValue(undefined);

            const session = getSession(TEST_USER_ID, 999);

            expect(session).toBeNull();
        });
    });

    describe('deleteSession', () => {
        it('应该删除指定会话', () => {
            mockRun.mockReturnValue({ changes: 1 });

            deleteSession(TEST_USER_ID, 1);

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM chat_sessions'));
            expect(mockRun).toHaveBeenCalledWith(1, TEST_USER_ID);
        });
    });

    describe('updateSessionTitle', () => {
        it('应该更新会话标题', () => {
            mockRun.mockReturnValue({ changes: 1 });

            updateSessionTitle(TEST_USER_ID, 1, '新标题');

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_sessions'));
            expect(mockRun).toHaveBeenCalledWith('新标题', 1, TEST_USER_ID);
        });
    });

    describe('toggleMessageFavorite', () => {
        it('应该设置消息收藏状态', () => {
            mockRun.mockReturnValue({ changes: 1 });

            toggleMessageFavorite(TEST_USER_ID, 1, true);

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE chat_messages'));
            expect(mockRun).toHaveBeenCalledWith(1, 1, TEST_USER_ID); // isFavorite ? 1 : 0
        });

        it('应该取消消息收藏', () => {
            mockRun.mockReturnValue({ changes: 1 });

            toggleMessageFavorite(TEST_USER_ID, 1, false);

            expect(mockRun).toHaveBeenCalledWith(0, 1, TEST_USER_ID);
        });
    });

    describe('getFavoriteMessages', () => {
        it('应该返回用户收藏的消息', () => {
            const mockFavorites = [
                { id: 1, content: 'Favorite message', is_favorite: 1 },
            ];
            mockAll.mockReturnValue(mockFavorites);

            const favorites = getFavoriteMessages(TEST_USER_ID);

            expect(favorites).toEqual(mockFavorites);
            expect(mockAll).toHaveBeenCalledWith(TEST_USER_ID);
        });
    });

    describe('searchMessages', () => {
        it('应该搜索匹配的消息', () => {
            const mockResults = [
                { messageId: 1, sessionId: 1, content: '包含关键词的消息' },
            ];
            mockAll.mockReturnValue(mockResults);

            const results = searchMessages(TEST_USER_ID, '关键词');

            expect(results).toEqual(mockResults);
            expect(mockAll).toHaveBeenCalledWith('%关键词%', TEST_USER_ID);
        });
    });
});
