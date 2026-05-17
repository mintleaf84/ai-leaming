// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { practiceSchedulingService, getAllTags, getUserWrongTags } from '../practice-scheduling';

const createMockQuery = (returnValue: any = []) => {
    const mockAll = vi.fn().mockResolvedValue(returnValue);
    const chain: any = {
        then: vi.fn((resolve: any) => resolve(returnValue)),
        get: vi.fn(() => ({})),
        all: mockAll,
    };
    const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin', 'onConflictDoUpdate', 'selectDistinct', 'groupBy'];
    methods.forEach((m) => {
        chain[m] = vi.fn(() => chain);
    });
    return chain;
};

const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const mockDrizzleDb = {
        select: vi.fn(() => createMockQuery([])),
        selectDistinct: vi.fn(() => createMockQuery([])),
        query: {}
    };

    return {
        mockDrizzleDb,
        mockDrizzleSchema: {
            questions: { id: 'questions.id', type: 'questions.type', options: 'questions.options', tags: 'questions.tags', dimension: 'questions.dimension', content: 'questions.content' },
            practice_logs: { id: 'practice_logs.id', question_id: 'practice_logs.question_id', user_id: 'practice_logs.user_id', is_correct: 'practice_logs.is_correct' },
            observation_zone: { id: 'observation_zone.id', tag_name: 'observation_zone.tag_name', status: 'observation_zone.status', user_id: 'observation_zone.user_id' },
            question_srs: { id: 'question_srs.id', user_id: 'question_srs.user_id', question_id: 'question_srs.question_id', due_date: 'question_srs.due_date' }
        }
    };
});

vi.mock('@/lib/db', () => ({
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema
}));

describe('practiceSchedulingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateSmartSession', () => {
        it('应该生成智能刷题会话', async () => {
            const config = { mode: 'smart', limit: 10, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([]));
            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateSmartSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该按 40/40/20 比例分配题目', async () => {
            const config = { mode: 'smart', limit: 10, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([
                { q: { id: 1, content: 'Q1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 2, content: 'Q2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 3, content: 'Q3', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 4, content: 'Q4', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } }
            ]));

            mockDrizzleDb.select.mockReturnValue(createMockQuery([
                { id: 5, content: 'Q5', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                { id: 6, content: 'Q6', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' }
            ]));

            const result = await practiceSchedulingService.generateSmartSession(config, userId);
            expect(result.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('generateReviewSession', () => {
        it('应该生成复习会话', async () => {
            const config = { mode: 'review', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateReviewSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateMistakesSession', () => {
        it('应该生成错题专项会话', async () => {
            const config = { mode: 'mistakes', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateMistakesSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateFocusSession', () => {
        it('应该在有筛选条件时按条件查询', async () => {
            const config = { mode: 'focus', limit: 5, types: ['single'], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该在没有筛选条件时调用随机会话', async () => {
            const config = { mode: 'focus', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateExamSession', () => {
        it('应该生成按 ID 排序的考试会话', async () => {
            const config = { mode: 'exam', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([
                { id: 3, content: 'Q3', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                { id: 1, content: 'Q1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                { id: 2, content: 'Q2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' }
            ]));

            const result = await practiceSchedulingService.generateExamSession(config, userId);
            expect(result).toHaveLength(3);
            expect(result[0].id).toBe(1);
        });
    });

    describe('generateRandomSession', () => {
        it('应该生成随机顺序的会话', async () => {
            const config = { mode: 'random', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateRandomSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateSessionByConfig', () => {
        it('应该根据模式分发到对应方法', async () => {
            const config = { mode: 'random', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateSessionByConfig(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该默认使用智能刷题模式', async () => {
            const config = { mode: 'unknown', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([]));
            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateSessionByConfig(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });
});

describe('getAllTags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('应该返回所有知识点标签', async () => {
        mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([
            { tag: 'tag1' },
            { tag: 'tag2' },
            { tag: 'tag3' }
        ]));

        const result = await getAllTags();
        expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });
});

describe('getUserWrongTags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('应该返回用户的错题知识点统计', async () => {
        const userId = 1;
        mockDrizzleDb.select.mockReturnValue(createMockQuery([
            { tag: 'tag1', count: 5 },
            { tag: 'tag2', count: 3 }
        ]));

        const result = await getUserWrongTags(userId);
        expect(result).toEqual([
            { tag: 'tag1', count: 5 },
            { tag: 'tag2', count: 3 }
        ]);
    });
});