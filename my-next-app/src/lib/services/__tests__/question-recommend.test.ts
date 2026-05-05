// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock
const { mockRagSearch, mockAddChunksBatch } = vi.hoisted(() => ({
    mockRagSearch: vi.fn(),
    mockAddChunksBatch: vi.fn().mockResolvedValue(0)
}));

vi.mock('@/lib/ai/rag', () => ({
    ragService: {
        search: mockRagSearch,
        addChunk: vi.fn().mockResolvedValue(undefined),
        addChunksBatch: mockAddChunksBatch
    }
}));

// Mock langchain-store
vi.mock('@/lib/ai/langchain-store', () => ({
    RagEmbeddings: vi.fn().mockImplementation(() => ({})),
    SqliteVecVectorStore: {
        fromExistingIndex: vi.fn().mockResolvedValue({
            similaritySearch: vi.fn().mockResolvedValue([
                { pageContent: 'Vector Q1', metadata: { question_id: 201 } },
                { pageContent: 'Vector Q2', metadata: { question_id: 202 } }
            ])
        })
    }
}));

// Mock drizzle - use vi.hoisted for all shared mock functions
const { mockSelect, mockAll, mockGet, mockRun, mockSql } = vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockAll: vi.fn().mockResolvedValue([]),
    mockGet: vi.fn().mockResolvedValue(null),
    mockRun: vi.fn().mockResolvedValue(undefined),
    mockSql: vi.fn((s: string) => {
        const result: any = { type: 'sql', sql: s };
        result.join = vi.fn((items: any[]) => items);
        return result;
    })
}));

const createChain = (): any => {
    const chain: any = {
        then: vi.fn((resolve: any) => resolve([])),
    };
    const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'all', 'get'];
    methods.forEach((m) => {
        chain[m] = vi.fn(() => chain);
    });
    chain.then.mockImplementation((resolve: any) => resolve([]));
    chain.all = mockAll;
    chain.get = mockGet;
    return chain;
};

const chain = createChain();

mockSelect.mockReturnValue(chain);

vi.mock('@/lib/db', () => ({
    drizzleDb: {
        select: mockSelect,
        all: mockAll,
        get: mockGet,
        run: mockRun
    },
    drizzleSchema: {
        practice_logs: {
            id: 'practice_logs.id',
            user_id: 'practice_logs.user_id',
            question_id: 'practice_logs.question_id',
            user_answer: 'practice_logs.user_answer',
            is_correct: 'practice_logs.is_correct',
            timestamp: 'practice_logs.timestamp'
        },
        questions: {
            id: 'questions.id',
            content: 'questions.content',
            answer: 'questions.answer',
            explanation: 'questions.explanation',
            tags: 'questions.tags',
            dimension: 'questions.dimension'
        },
        user_mastery: {
            user_id: 'user_mastery.user_id',
            tag_name: 'user_mastery.tag_name',
            score: 'user_mastery.score',
            total_count: 'user_mastery.total_count'
        }
    }
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((a: any, b: any) => ({ type: 'eq', a, b })),
    and: vi.fn((...args: any[]) => ({ type: 'and', args })),
    or: vi.fn((...args: any[]) => ({ type: 'or', args })),
    desc: vi.fn((x: any) => ({ type: 'desc', x })),
    sql: mockSql,
    lt: vi.fn((a: any, b: any) => ({ type: 'lt', a, b })),
    gte: vi.fn((a: any, b: any) => ({ type: 'gte', a, b }))
}));

import { wrongQuestionRecommend, getUserLearningReport } from '../question-recommend';

describe('QuestionRecommend Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset chain
        const chainMethods = ['from', 'where', 'orderBy', 'limit', 'all', 'get'];
        chainMethods.forEach((m) => {
            (chain as any)[m].mockReturnValue(chain);
        });
        (chain as any).then.mockImplementation((resolve: any) => resolve([]));
        mockAll.mockResolvedValue([]);
        mockGet.mockResolvedValue(null);
        mockRun.mockResolvedValue(undefined);
        mockAddChunksBatch.mockResolvedValue(0);
    });

    describe('getWeakestTags', () => {
        it('should return tags sorted by score', async () => {
            const mockMastery = [
                { tagName: '心理学基础', score: 30, totalCount: 10 },
                { tagName: '学习理论', score: 50, totalCount: 5 },
                { tagName: '教学策略', score: 80, totalCount: 8 }
            ];

            mockAll.mockImplementation(() => Promise.resolve(mockMastery));

            const result = await wrongQuestionRecommend.getWeakestTags(1, 5);

            expect(result).toHaveLength(3);
            expect(result[0].tag).toBe('心理学基础');
            expect(result[0].score).toBe(30);
        });

        it('should return empty array when no mastery data', async () => {
            mockAll.mockResolvedValue([]);

            const result = await wrongQuestionRecommend.getWeakestTags(1, 5);

            expect(result).toEqual([]);
        });

        it('should filter out tags with less than 3 attempts', async () => {
            const mockMastery = [
                { tagName: 'rare', score: 10, totalCount: 1 },
                { tagName: 'common', score: 20, totalCount: 5 }
            ];

            mockAll.mockImplementation(() => Promise.resolve(mockMastery));

            const result = await wrongQuestionRecommend.getWeakestTags(1, 5);

            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe('common');
        });
    });

    describe('recommendByTags (vector-based)', () => {
        it('should call vector search with question content when flag is set', async () => {
            // mockGet is shared: 1st call = drizzleDb.get (flag check), 2nd call = chain.get (question content)
            let getCall = 0;
            mockGet.mockImplementation(() => {
                getCall++;
                if (getCall === 1) return Promise.resolve({ value: 'true' });
                return Promise.resolve({ content: 'Test question content' });
            });
            mockRagSearch.mockResolvedValue([]);

            await wrongQuestionRecommend.recommendByTags(1, [], 3);

            expect(mockRagSearch).toHaveBeenCalledWith('Test question content', 9, 'question');
        });

        it('should skip initialization when persistent flag exists', async () => {
            mockGet.mockResolvedValue({ value: 'true' });
            mockRagSearch.mockResolvedValue([]);

            await wrongQuestionRecommend.recommendByTags(1, [], 3);

            // Should NOT call addChunksBatch since flag causes early return from ensureVectorData
            expect(mockAddChunksBatch).not.toHaveBeenCalled();
        });

        it('should initialize questions via batch when no flag and count < 50', async () => {
            let getCall = 0;
            let allCall = 0;
            mockGet.mockImplementation(() => {
                getCall++;
                if (getCall === 1) return Promise.resolve(null); // no flag
                return Promise.resolve({ content: 'Q content' });
            });
            mockAll.mockImplementation(() => {
                allCall++;
                if (allCall === 1) return Promise.resolve([{ count: 10 }]); // count check
                return Promise.resolve([ // all questions
                    { id: 1, content: 'Q1', explanation: 'E1', tags: '[]', dimension: 'knowledge' },
                    { id: 2, content: 'Q2', explanation: 'E2', tags: '[]', dimension: 'knowledge' }
                ]);
            });
            mockAddChunksBatch.mockResolvedValue(2);
            mockRagSearch.mockResolvedValue([]);

            await wrongQuestionRecommend.recommendByTags(1, [], 3);

            expect(mockAddChunksBatch).toHaveBeenCalled();
            expect(mockRun).toHaveBeenCalled(); // flag written
        });
    });

    describe('recommendSimilar', () => {
        it('should return empty when user has no wrong questions', async () => {
            mockAll.mockResolvedValue([]);

            const result = await wrongQuestionRecommend.recommendSimilar(1, 5);

            expect(result).toEqual([]);
        });
    });

    describe('filterAlreadyDone', () => {
        it('should filter out already done questions', async () => {
            const mockDoneQuestions = [
                { questionId: 10 },
                { questionId: 20 }
            ];

            mockAll.mockImplementation(() => Promise.resolve(mockDoneQuestions));

            const mockResults = [
                { content: 'Q1', metadata: { question_id: 10 } },
                { content: 'Q2', metadata: { question_id: 20 } },
                { content: 'Q3', metadata: { question_id: 30 } }
            ] as any;

            const result = await wrongQuestionRecommend.filterAlreadyDone(1, mockResults, 5);

            expect(result).toHaveLength(1);
            expect(result[0].metadata.question_id).toBe(30);
        });

        it('should respect limit parameter', async () => {
            mockAll.mockResolvedValue([]);

            const mockResults = [
                { content: 'Q1', metadata: { question_id: 1 } },
                { content: 'Q2', metadata: { question_id: 2 } },
                { content: 'Q3', metadata: { question_id: 3 } }
            ] as any;

            const result = await wrongQuestionRecommend.filterAlreadyDone(1, mockResults, 2);

            expect(result).toHaveLength(2);
        });
    });

    describe('getUserLearningReport', () => {
        it('should handle zero total questions', async () => {
            const mockStats = { total: 0, correct: 0 };

            mockAll.mockImplementation(() => Promise.resolve([mockStats]));

            const result = await getUserLearningReport(1);

            expect(result).not.toBeNull();
            expect(result?.accuracy).toBe('0.0');
        });
    });
});
