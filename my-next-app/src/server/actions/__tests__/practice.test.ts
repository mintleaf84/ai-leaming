import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const mocks = vi.hoisted(() => {
    return {
        prepare: vi.fn(),
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
        requireUser: vi.fn(),
        generateSession: vi.fn(),
        updateMastery: vi.fn(),
        generateSessionByConfig: vi.fn(),
    };
});

// Mock DB
vi.mock('@/lib/db', () => ({
    default: {
        prepare: mocks.prepare,
    },
}));

// Mock Auth
vi.mock('@/lib/auth/auth', () => ({
    requireUser: mocks.requireUser,
}));

// Mock Scheduling Service
vi.mock('@/lib/services/scheduling', () => ({
    schedulingService: {
        generateSession: mocks.generateSession,
    },
}));

// Mock Practice Scheduling (Dynamic Import)
vi.mock('@/lib/practice/practice-scheduling', () => ({
    generateSessionByConfig: mocks.generateSessionByConfig,
}));

// Mock Mastery Service (Dynamic Import)
vi.mock('@/lib/services/mastery', () => ({
    masteryService: {
        updateMastery: mocks.updateMastery,
    },
}));

import {
    getPracticeSessionAction,
    submitAnswerAction,
    saveSessionReviewAction,
    getPracticeSessionByConfigAction,
    getSessionByIdAction,
} from '../practice';

describe('Practice Server Actions', () => {
    const TEST_USER = { id: 1, role: 'user' };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireUser.mockResolvedValue(TEST_USER);

        // Setup default DB mock behavior
        mocks.prepare.mockReturnValue({
            run: mocks.run,
            get: mocks.get,
            all: mocks.all,
        });
    });

    describe('getPracticeSessionAction', () => {
        it('should create new session if forced', async () => {
            mocks.all.mockReturnValue([{ id: 1, content: 'Q1', options: '[]', tags: '[]' }]);
            mocks.run.mockReturnValue({ lastInsertRowid: 1 });

            const result = await getPracticeSessionAction(true);

            expect(result.questions).toHaveLength(1);
            expect(result.sessionId).toBeDefined();
            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practice_sessions'));
        });

        it('should return empty session if no questions', async () => {
            mocks.all.mockReturnValue([]);

            const result = await getPracticeSessionAction(true);

            expect(result.questions).toHaveLength(0);
        });

        it('should resume session if available', async () => {
            const mockSession = {
                id: 'sess_1',
                questions_json: JSON.stringify([{ id: 1 }]),
                total_questions: 5
            };

            // Mock resume check flow
            mocks.get
                .mockReturnValueOnce(mockSession) // lastSession
                .mockReturnValueOnce({ count: 2 }); // logCount

            const result = await getPracticeSessionAction(false);

            expect(result.sessionId).toBe('sess_1');
            expect(result.resumed).toBe(true);
            expect(result.completedCount).toBe(2);
        });
    });

    describe('submitAnswerAction', () => {
        it('should record answer and update mastery', async () => {
            // Mock question lookup for tags
            mocks.get.mockReturnValue({ tags: '["tag1"]', dimension: 'content' });

            await submitAnswerAction(1, 'A', true, 1000, 'sess_1');

            // Verify db logs
            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practice_logs'));
            // Verify session update
            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE practice_sessions'));
            // Verify mastery update
            expect(mocks.updateMastery).toHaveBeenCalledWith(TEST_USER.id, 'tag1', 'content', true);
        });

        it('should handle missing session ID', async () => {
            await submitAnswerAction(1, 'A', true, 1000);

            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practice_logs'));
        });
    });

    describe('saveSessionReviewAction', () => {
        it('should save review data', async () => {
            await saveSessionReviewAction('sess_1', 1, { correctness: 'correct' });

            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO session_reviews'));
            expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE practice_sessions'));
        });
    });

    describe('getPracticeSessionByConfigAction', () => {
        it('should generate session based on config', async () => {
            mocks.generateSessionByConfig.mockReturnValue([{ id: 1, content: 'Q1', options: '[]', tags: '[]' }]);

            const config = { mode: 'test', limit: 10 };
            const result = await getPracticeSessionByConfigAction(config);

            expect(mocks.generateSessionByConfig).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }), TEST_USER.id);
            expect(result.questions).toHaveLength(1);
        });
    });

    describe('getSessionByIdAction', () => {
        it('should return null if session not found', async () => {
            mocks.get.mockReturnValue(undefined);

            const result = await getSessionByIdAction('unknown');

            expect(result).toBeNull();
        });

        it('should load resumeable session with full questions', async () => {
            const mockSession = {
                id: 'sess_1',
                questions_json: JSON.stringify([{ id: 1, content: 'Full Q', options: '[]', tags: '[]' }]),
                practice_mode: 'test'
            };

            mocks.get
                .mockReturnValueOnce(mockSession) // session
                .mockReturnValueOnce({ count: 5 }); // logCount

            const result = await getSessionByIdAction('sess_1');

            expect(result?.sessionId).toBe('sess_1');
            expect(result?.questions[0].content).toBe('Full Q');
            expect(result?.completedCount).toBe(5);
        });
    });
});
