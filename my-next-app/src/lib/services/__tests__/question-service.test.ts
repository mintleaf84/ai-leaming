// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { questionService } from '../question';

const { mockDb, mockDrizzleDb, mockDrizzleSchema, mockRagService } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
            get: vi.fn(() => ({})),
        };
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'all', 'innerJoin', 'leftJoin', 'onConflictDoUpdate'];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };

    const chain = makeChain();
    const mockDrizzleDb = {
        ...chain,
        query: {
            questions: { findMany: vi.fn(), findFirst: vi.fn() },
        },
        transaction: vi.fn(async (cb) => cb(chain)),
    };

    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockDrizzleDb,
        mockDrizzleSchema: {
            questions: { id: 'questions.id', type: 'questions.type' }
        },
        mockRagService: {
            getEmbedding: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ 
    default: mockDb, 
    db: mockDb, 
    drizzleDb: mockDrizzleDb, 
    drizzleSchema: mockDrizzleSchema 
}));

vi.mock('@/lib/ai/rag', () => ({
    ragService: mockRagService
}));

vi.mock('@/lib/db/safe-query', () => ({
    safeGet: vi.fn((_, __, ___) => _?.get ? _.get() : _),
    safeAll: vi.fn((_, __, ___) => _?.all ? _.all() : _)
}));

describe('Question Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const chain = mockDrizzleDb as any;
        ['select', 'from', 'where', 'limit', 'offset', 'orderBy'].forEach(m => {
            chain[m].mockReturnValue(chain);
        });
        chain.get.mockReturnValue({});
        chain.then.mockImplementation((resolve: any) => resolve([]));
    });

    describe('getById', () => {
        it('should return question when found', async () => {
            const mockQ = { id: 1, content: 'Test' };
            (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(mockQ);

            const result = await questionService.getById(1);

            expect(result).toEqual(mockQ);
        });
    });

    describe('list', () => {
        it('should list questions with pagination', async () => {
            const mockItems = [{ id: 1 }, { id: 2 }];
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue(mockItems);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 10 });

            const result = await questionService.list({ offset: 0, limit: 10 });

            expect(result.items).toEqual(mockItems);
            expect(result.total).toBe(10);
        });

        it('should apply mode filter', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            await questionService.list({ type: ['single'] });

            // 验证是否调用了查询
            expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
        });
    });

    describe('searchSimilarQuestions', () => {
        it('should return similar questions when vector search works', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1, 0.2]);
            mockDb.prepare.mockReturnValueOnce({ get: () => 'v0.1.7' });

            const mockResults = [{ id: 1, distance: 0.5 }];
            mockDb.prepare.mockReturnValueOnce({ all: () => mockResults });

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual(mockResults);
            expect(mockRagService.getEmbedding).toHaveBeenCalledWith('content');
        });

        it('should return empty list if vector extension missing', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1]);
            mockDb.prepare.mockImplementationOnce(() => { throw new Error('no vec'); });

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual([]);
        });
    });
});
