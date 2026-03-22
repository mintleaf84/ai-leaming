// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockBetterDb } = vi.hoisted(() => {
    const { createBetterDbMock } = require('../../../../tests/utils/db-mock-utils');
    return {
        mockBetterDb: createBetterDbMock()
    };
});

const { mockSafeGet, mockSafeAll } = vi.hoisted(() => {
    return {
        mockSafeGet: vi.fn(),
        mockSafeAll: vi.fn(),
    };
});

vi.mock('@/lib/db', () => ({
    default: mockBetterDb
}));

vi.mock('@/lib/db/safe-query', () => ({
    safeGet: mockSafeGet,
    safeAll: mockSafeAll,
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

// Mock scheduling service
vi.mock('@/lib/services/scheduling', () => ({
    schedulingService: {
        getDailyScheduledQuestions: vi.fn().mockReturnValue([]),
    }
}));

describe('Practice Actions', () => {
    beforeEach(() => {
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    describe('getPracticeSessionAction', () => {
        it('should resume an existing session if available and not finished', async () => {
            const existingSession = {
                id: 'session-123',
                user_id: 1,
                total_questions: 10,
                questions_json: [{ id: 1, content: 'Q1' }],
                created_at: '2024-01-01',
                correct_count: 0,
                review_count: 0,
            };

            mockSafeGet
                .mockReturnValueOnce(existingSession)
                .mockReturnValueOnce({ count: 5 });

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.sessionId).toBe('session-123');
            expect(result.resumed).toBe(true);
            expect(result.completedCount).toBe(5);
        });

        it('should create a new session if no existing session found and verify JSON content', async () => {
            const questions = [
                { id: 1, content: 'Q1', options: ['A'], tags: ['T1'], answer: 'A', explanation: 'E1', dimension: 'knowledge' }
            ];

            mockSafeGet.mockReturnValue(null);
            mockSafeAll.mockReturnValue(questions);

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.resumed).toBeUndefined();
            // 验证 Session ID 格式：字母数字组合，长度 10-13
            expect(result.sessionId).toMatch(/^[a-z0-9]{10,13}$/);
            
            // 验证 DB insert 是否包含正确的题目 JSON
            const calls = mockBetterDb._state.calls;
            const insertCall = calls.find((c: any) => c.sql.includes('INSERT INTO practice_sessions'));
            expect(insertCall).toBeDefined();
            
            const questionsJson = insertCall?.args[3]; // sessionId, userId, total, questions_json
            const parsed = JSON.parse(questionsJson);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].id).toBe(1);
        });
    });
});
