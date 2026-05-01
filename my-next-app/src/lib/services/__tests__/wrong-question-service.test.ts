// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dayjs - must be default export that returns an object with subtract
vi.mock('dayjs', () => {
    const mockDayjs = {
        subtract: vi.fn().mockReturnValue({
            format: vi.fn(() => '2024-01-01 00:00:00')
        }),
        format: vi.fn(() => '2024-01-01 00:00:00')
    };
    return { default: vi.fn(() => mockDayjs) };
});

const { mockInsert, mockDelete, mockAll } = vi.hoisted(() => ({
    mockInsert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
                set: vi.fn().mockResolvedValue({})
            })
        })
    }),
    mockDelete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({})
    }),
    mockAll: vi.fn().mockResolvedValue([{ count: 3 }])
}));

vi.mock('@/lib/db', () => ({
    drizzleDb: {
        insert: mockInsert,
        delete: mockDelete,
        select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ count: 10 }),
                    orderBy: vi.fn().mockResolvedValue([])
                })
            })
        }),
        all: mockAll
    }
}));

vi.mock('@/lib/db/drizzle-schema', () => ({
    practice_logs: { id: 'practice_logs.id', question_id: 'practice_logs.question_id', user_id: 'practice_logs.user_id', is_correct: 'practice_logs.is_correct', timestamp: 'practice_logs.timestamp', user_answer: 'practice_logs.user_answer' },
    mastered_questions: { question_id: 'mastered_questions.question_id', user_id: 'mastered_questions.user_id', mastered_at: 'mastered_questions.mastered_at' },
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
    and: vi.fn((...args) => ({ type: 'and', args })),
    desc: vi.fn((x) => ({ type: 'desc', x })),
    sql: vi.fn((s) => ({ type: 'sql', sql: s })),
    gte: vi.fn((a, b) => ({ type: 'gte', a, b })),
}));

import { wrongQuestionService } from '../wrong-question';

describe('WrongQuestionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getStats', () => {
        it('should return stats with counts from database queries', async () => {
            const stats = await wrongQuestionService.getStats(1);

            expect(stats.total).toBe(10);
            expect(stats.recent).toBe(10);
            expect(stats.frequent).toBe(3);
        });
    });

    describe('markAsMastered', () => {
        it('should insert mastered question with note', async () => {
            const result = await wrongQuestionService.markAsMastered(1, 100, 'important');

            expect(mockInsert).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should insert mastered question without note', async () => {
            const result = await wrongQuestionService.markAsMastered(1, 100);

            expect(mockInsert).toHaveBeenCalled();
            expect(result).toBe(true);
        });
    });

    describe('unmarkMastered', () => {
        it('should delete mastered question', async () => {
            const result = await wrongQuestionService.unmarkMastered(1, 100);

            expect(mockDelete).toHaveBeenCalled();
            expect(result).toBe(true);
        });
    });
});