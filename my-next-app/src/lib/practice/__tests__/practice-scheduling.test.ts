// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { practiceSchedulingService, getAllTags, getUserWrongTags } from '../practice-scheduling';
import type { PracticeConfig } from '@/types/practice';
import { createMockQuery } from '@/lib/__tests__/db-mock-utils';

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
    const TEST_ID_RANGES = {
        stubborn: { min: 100, max: 200 },
        blindSpot: { min: 200, max: 300 },
        regular: { min: 300, max: 400 }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateSmartSession', () => {
        it('应该生成智能刷题会话', async () => {
            const config: PracticeConfig = { mode: 'smart', limit: 10, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([]));
            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateSmartSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该按 40/40/20 比例分配题目', async () => {
            const config: PracticeConfig = { mode: 'smart', limit: 10, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([
                { q: { id: 101, content: 'Stubborn1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 102, content: 'Stubborn2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 103, content: 'Stubborn3', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } },
                { q: { id: 104, content: 'Stubborn4', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' } }
            ]));

            mockDrizzleDb.select
                .mockReturnValueOnce(createMockQuery([
                    { id: 201, content: 'BlindSpot1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                    { id: 202, content: 'BlindSpot2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                    { id: 203, content: 'BlindSpot3', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                    { id: 204, content: 'BlindSpot4', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' }
                ]))
                .mockReturnValueOnce(createMockQuery([
                    { id: 301, content: 'Regular1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                    { id: 302, content: 'Regular2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' }
                ]));

            const result = await practiceSchedulingService.generateSmartSession(config, userId);
            expect(result).toHaveLength(10);
            expect(result.filter(q => q.id >= TEST_ID_RANGES.stubborn.min && q.id < TEST_ID_RANGES.stubborn.max)).toHaveLength(4);
            expect(result.filter(q => q.id >= TEST_ID_RANGES.blindSpot.min && q.id < TEST_ID_RANGES.blindSpot.max)).toHaveLength(4);
            expect(result.filter(q => q.id >= TEST_ID_RANGES.regular.min && q.id < TEST_ID_RANGES.regular.max)).toHaveLength(2);
        });
    });

    describe('generateReviewSession', () => {
        it('应该生成复习会话', async () => {
            const config: PracticeConfig = { mode: 'review', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateReviewSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateMistakesSession', () => {
        it('应该生成错题专项会话', async () => {
            const config: PracticeConfig = { mode: 'mistakes', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateMistakesSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该按错误次数降序排列', async () => {
            const config: PracticeConfig = { mode: 'mistakes', limit: 10, types: [], dimensions: [], tags: [] };
            const userId = 1;

            const mistakeQuestions = [
                { q: { id: 1, content: 'Q1', options: '[]', tags: '["tag1"]', type: 'single', dimension: 'knowledge' }, error_count: 5 },
                { q: { id: 2, content: 'Q2', options: '[]', tags: '["tag2"]', type: 'single', dimension: 'knowledge' }, error_count: 3 },
                { q: { id: 3, content: 'Q3', options: '[]', tags: '["tag3"]', type: 'single', dimension: 'knowledge' }, error_count: 1 },
            ];

            mockDrizzleDb.select.mockReturnValue(createMockQuery(mistakeQuestions));

            const result = await practiceSchedulingService.generateMistakesSession(config, userId);
            expect(result).toHaveLength(3);
            expect(result[0].id).toBe(1);
        });

        it('应该按类型筛选错题', async () => {
            const config: PracticeConfig = { mode: 'mistakes', limit: 5, types: ['multiple'], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateMistakesSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateFocusSession', () => {
        it('应该在有筛选条件时按条件查询', async () => {
            const config: PracticeConfig = { mode: 'focus', limit: 5, types: ['single'], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该按维度筛选', async () => {
            const config: PracticeConfig = { mode: 'focus', limit: 5, types: [], dimensions: ['application'], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([
                { id: 1, content: 'AppQ1', options: '[]', tags: '["tag1"]', type: 'single', dimension: 'application' }
            ]));

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(result.every(q => q.dimension === 'application')).toBe(true);
        });

        it('应该按知识点标签筛选', async () => {
            const config: PracticeConfig = { mode: 'focus', limit: 5, types: [], dimensions: [], tags: ['教育心理学'] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([
                { id: 1, content: 'TaggedQ1', options: '[]', tags: '["教育心理学"]', type: 'single', dimension: 'knowledge' }
            ]));

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(result).toHaveLength(1);
        });

        it('应该在没有筛选条件时调用随机会话', async () => {
            const config: PracticeConfig = { mode: 'focus', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            const result = await practiceSchedulingService.generateFocusSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateExamSession', () => {
        it('应该生成按 ID 排序的考试会话', async () => {
            const config: PracticeConfig = { mode: 'exam', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([
                { id: 3, content: 'Q3', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                { id: 1, content: 'Q1', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' },
                { id: 2, content: 'Q2', options: '[]', tags: '[]', type: 'single', dimension: 'knowledge' }
            ]));

            const result = await practiceSchedulingService.generateExamSession(config, userId);
            expect(result).toHaveLength(3);
            expect(result[0].id).toBe(1);
            expect(result[1].id).toBe(2);
            expect(result[2].id).toBe(3);
        });

        it('应该处理空数据', async () => {
            const config: PracticeConfig = { mode: 'exam', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateExamSession(config, userId);
            expect(result).toEqual([]);
        });

        it('应该按类型筛选考试题目', async () => {
            const config: PracticeConfig = { mode: 'exam', limit: 10, types: ['single'], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateExamSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('generateRandomSession', () => {
        it('应该生成随机顺序的会话', async () => {
            const config: PracticeConfig = { mode: 'random', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateRandomSession(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该处理空数据源', async () => {
            const config: PracticeConfig = { mode: 'random', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateRandomSession(config, userId);
            expect(result).toEqual([]);
        });
    });

    describe('generateSessionByConfig', () => {
        it('应该根据模式分发到对应方法', async () => {
            const config: PracticeConfig = { mode: 'random', limit: 5, types: [], dimensions: [], tags: [] };
            const userId = 1;

            mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

            const result = await practiceSchedulingService.generateSessionByConfig(config, userId);
            expect(Array.isArray(result)).toBe(true);
        });

        it('应该默认使用智能刷题模式', async () => {
            const config = { mode: 'unknown', limit: 5, types: [], dimensions: [], tags: [] } as unknown as PracticeConfig;
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

    it('应该返回空数组当没有标签', async () => {
        mockDrizzleDb.selectDistinct.mockReturnValue(createMockQuery([]));

        const result = await getAllTags();
        expect(result).toEqual([]);
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

    it('应该返回空数组当用户没有错题', async () => {
        const userId = 1;
        mockDrizzleDb.select.mockReturnValue(createMockQuery([]));

        const result = await getUserWrongTags(userId);
        expect(result).toEqual([]);
    });
});
