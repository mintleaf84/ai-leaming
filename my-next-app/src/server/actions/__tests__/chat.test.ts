// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const mocks = vi.hoisted(() => {
    return {
        createSession: vi.fn(),
        listSessions: vi.fn(),
        getSession: vi.fn(),
        getRecentMessages: vi.fn(),
        updateSessionTitle: vi.fn(),
        deleteSession: vi.fn(),
        getSessionMessages: vi.fn(),
        generateTextWrapper: vi.fn(),
        parseCommand: vi.fn(),
        handleQuizCommand: vi.fn(),
        handleExplainCommand: vi.fn(),
        requireUser: vi.fn(),
        searchKnowledgeBase: vi.fn(),
        toggleMessageFavorite: vi.fn(),
        getFavoriteMessages: vi.fn(),
        searchMessages: vi.fn(),
    };
});

vi.mock('@/lib/services/chat', () => ({
    createSession: mocks.createSession,
    listSessions: mocks.listSessions,
    getSession: mocks.getSession,
    getRecentMessages: mocks.getRecentMessages,
    updateSessionTitle: mocks.updateSessionTitle,
    deleteSession: mocks.deleteSession,
    getSessionMessages: mocks.getSessionMessages,
    toggleMessageFavorite: mocks.toggleMessageFavorite,
    getFavoriteMessages: mocks.getFavoriteMessages,
    searchMessages: mocks.searchMessages,
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mocks.generateTextWrapper,
}));

vi.mock('@/lib/services/chat-rag', () => ({
    parseCommand: mocks.parseCommand,
    handleQuizCommand: mocks.handleQuizCommand,
    handleExplainCommand: mocks.handleExplainCommand,
    searchKnowledgeBase: mocks.searchKnowledgeBase,
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: mocks.requireUser,
}));

// 2. Import module under test
import {
    createChatSession,
    getChatSessions,
    getChatSession,
    generateChatTitle,
    handleChatCommand,
    deleteChatSession,
    loadSessionMessages,
    searchQuestions,
    toggleMessageFavoriteAction,
    getFavoriteMessagesAction,
    searchMessagesAction,
} from '../chat';

describe('Chat Server Actions', () => {
    const TEST_USER = { id: 1, role: 'user' };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock behavior for auth
        mocks.requireUser.mockResolvedValue(TEST_USER);
    });

    describe('createChatSession', () => {
        it('should create session for authenticated user', async () => {
            mocks.createSession.mockReturnValue(123);

            const sessionId = await createChatSession();

            expect(mocks.requireUser).toHaveBeenCalled();
            expect(mocks.createSession).toHaveBeenCalledWith(TEST_USER.id, '新对话');
            expect(sessionId).toBe(123);
        });

        it('should throw error if creation fails', async () => {
            mocks.createSession.mockImplementation(() => { throw new Error('DB Error'); });

            await expect(createChatSession()).rejects.toThrow('创建会话失败');
        });
    });

    describe('getChatSessions', () => {
        it('should return session list', async () => {
            const mockList = [{ id: 1, title: 'Test' }];
            mocks.listSessions.mockReturnValue(mockList);

            const result = await getChatSessions();

            expect(mocks.listSessions).toHaveBeenCalledWith(TEST_USER.id, 50);
            expect(result).toEqual(mockList);
        });

        it('should return empty array on error', async () => {
            mocks.listSessions.mockImplementation(() => { throw new Error('DB Error'); });

            const result = await getChatSessions();

            expect(result).toEqual([]);
        });
    });

    describe('getChatSession', () => {
        it('should return session details', async () => {
            const mockSession = { id: 1, title: 'Test' };
            mocks.getSession.mockReturnValue(mockSession);

            const result = await getChatSession(1);

            expect(mocks.getSession).toHaveBeenCalledWith(TEST_USER.id, 1);
            expect(result).toEqual(mockSession);
        });
    });

    describe('generateChatTitle', () => {
        it('should generate title from AI', async () => {
            mocks.getRecentMessages.mockReturnValue([
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'hi' }
            ]);
            mocks.generateTextWrapper.mockResolvedValue({ text: 'Generated Title' });

            const title = await generateChatTitle(1);

            expect(mocks.generateTextWrapper).toHaveBeenCalled();
            expect(mocks.updateSessionTitle).toHaveBeenCalledWith(TEST_USER.id, 1, 'Generated Title');
            expect(title).toBe('Generated Title');
        });

        it('should use default title if no messages', async () => {
            mocks.getRecentMessages.mockReturnValue([]);

            const title = await generateChatTitle(1);

            expect(mocks.generateTextWrapper).not.toHaveBeenCalled();
            expect(title).toBe('新对话');
        });
    });

    describe('handleChatCommand', () => {
        it('should ignore non-commands', async () => {
            mocks.parseCommand.mockReturnValue({ type: 'none' });

            const result = await handleChatCommand('hello');

            expect(result).toBeNull();
        });

        it('should handle quiz command', async () => {
            mocks.parseCommand.mockReturnValue({ type: 'quiz', keyword: 'math' });
            mocks.handleQuizCommand.mockResolvedValue('Quiz Content');

            const result = await handleChatCommand('/quiz math');

            expect(mocks.handleQuizCommand).toHaveBeenCalledWith('math');
            expect(result).toBe('Quiz Content');
        });
    });

    describe('deleteChatSession', () => {
        it('should delete session', async () => {
            await deleteChatSession(1);

            expect(mocks.deleteSession).toHaveBeenCalledWith(TEST_USER.id, 1);
        });
    });

    describe('loadSessionMessages', () => {
        it('should load messages', async () => {
            mocks.getSessionMessages.mockReturnValue([]);

            await loadSessionMessages(1);

            expect(mocks.getSessionMessages).toHaveBeenCalledWith(TEST_USER.id, 1);
        });
    });

    describe('searchQuestions', () => {
        it('should search knowledge base', async () => {
            mocks.searchKnowledgeBase.mockResolvedValue('Result');

            const result = await searchQuestions('query');

            expect(mocks.searchKnowledgeBase).toHaveBeenCalledWith('query', 5);
            expect(result).toBe('Result');
        });
    });

    describe('toggleMessageFavoriteAction', () => {
        it('should toggle favorite status', async () => {
            mocks.toggleMessageFavorite.mockImplementation(() => { });

            const result = await toggleMessageFavoriteAction(1, true);

            expect(mocks.toggleMessageFavorite).toHaveBeenCalledWith(TEST_USER.id, 1, true);
            expect(result).toEqual({ success: true });
        });

        it('should return failure on error', async () => {
            mocks.toggleMessageFavorite.mockImplementation(() => { throw new Error('DB Error'); });

            const result = await toggleMessageFavoriteAction(1, true);

            expect(result).toEqual({ success: false });
        });
    });

    describe('getFavoriteMessagesAction', () => {
        it('should return favorite messages', async () => {
            const mockMsgs = [{ id: 1 }];
            mocks.getFavoriteMessages.mockReturnValue(mockMsgs);

            const result = await getFavoriteMessagesAction();

            expect(mocks.getFavoriteMessages).toHaveBeenCalledWith(TEST_USER.id);
            expect(result).toEqual(mockMsgs);
        });

        it('should return empty array on error', async () => {
            mocks.getFavoriteMessages.mockImplementation(() => { throw new Error('DB Error'); });

            const result = await getFavoriteMessagesAction();

            expect(result).toEqual([]);
        });
    });

    describe('searchMessagesAction', () => {
        it('should return search results', async () => {
            const mockResults = [{ id: 1 }];
            mocks.searchMessages.mockReturnValue(mockResults);

            const result = await searchMessagesAction('query');

            expect(mocks.searchMessages).toHaveBeenCalledWith(TEST_USER.id, 'query');
            expect(result).toEqual(mockResults);
        });

        it('should return empty array on error', async () => {
            mocks.searchMessages.mockImplementation(() => { throw new Error('DB Error'); });

            const result = await searchMessagesAction('query');

            expect(result).toEqual([]);
        });
    });
});
