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
        execute: vi.fn(async () => []),
    };

    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockDrizzleDb,
        mockDrizzleSchema: {
            questions: { id: 'questions.id', type: 'questions.type', dimension: 'questions.dimension', tags: 'questions.tags', content: 'questions.content', ai_mnemonic: 'questions.ai_mnemonic' }
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
            const mockQ = { id: 1, content: 'Test 题干内容足够长', options: '["A", "B"]', answer: 'A', explanation: '解析内容足够长', tags: '["test"]', type: 'single', dimension: 'knowledge' };
            (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(mockQ);

            const result = await questionService.getById(1);

            expect(result).toBeDefined();
            expect(result?.id).toBe(1);
        });

        it('should return null when not found', async () => {
            (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(null);

            const result = await questionService.getById(999);

            expect(result).toBeNull();
        });
    });

    describe('getSummary', () => {
        it('should return question summary when found', async () => {
            const mockQ = { 
                id: 1, 
                content: 'Test 题干内容', 
                options: '["A", "B"]', 
                answer: 'A', 
                type: 'single', 
                dimension: 'knowledge',
                tags: '["test"]'
            };
            (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(mockQ);

            const result = await questionService.getSummary(1);

            expect(result).toBeDefined();
            expect(result?.id).toBe(1);
            expect(result?.type).toBe('single');
        });

        it('should return null when question not found', async () => {
            (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(null);

            const result = await questionService.getSummary(999);

            expect(result).toBeNull();
        });
    });

    describe('list', () => {
        it('should list questions with pagination', async () => {
            const mockItems = [
                { id: 1, content: 'Test1 内容足够长', options: '["A", "B"]', answer: 'A', explanation: '解析内容足够长', tags: '["test"]', type: 'single', dimension: 'knowledge' },
                { id: 2, content: 'Test2 内容足够长', options: '["A", "B"]', answer: 'A', explanation: '解析内容足够长', tags: '["test"]', type: 'single', dimension: 'knowledge' }
            ];
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue(mockItems);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 10 });

            const result = await questionService.list({ offset: 0, limit: 10 });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(10);
        });

        it('should apply type filter', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            await questionService.list({ type: ['single'] });

            expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
        });

        it('should apply dimension filter', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            await questionService.list({ dimension: 'knowledge' });

            expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
        });

        it('should apply search filter', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            await questionService.list({ search: '测试' });

            expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
        });

        it('should apply tags filter', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            await questionService.list({ tags: ['数学'] });

            expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
        });

        it('should return empty list when no results', async () => {
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
            (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

            const result = await questionService.list();

            expect(result.items).toEqual([]);
            expect(result.total).toBe(0);
        });
    });

    describe('updateMnemonic', () => {
        it('should update mnemonic successfully', async () => {
            const chain = mockDrizzleDb as any;
            chain.update.mockReturnValue(chain);
            chain.set.mockReturnValue(chain);
            chain.where.mockResolvedValue({});

            const result = await questionService.updateMnemonic(1, '助记词内容');

            expect(result).toBe(true);
        });
    });

    describe('create', () => {
        it('should create question successfully', async () => {
            const mockQuestion = { id: 1, content: '新题目', type: 'single' };
            const chain = mockDrizzleDb as any;
            chain.insert.mockReturnValue(chain);
            chain.values.mockReturnValue(chain);
            chain.returning = vi.fn().mockResolvedValue([mockQuestion]);

            const result = await questionService.create({
                content: '新题目',
                type: 'single',
                answer: 'A',
                options: ['A', 'B', 'C', 'D']
            });

            expect(result).toEqual(mockQuestion);
        });
    });

    describe('update', () => {
        it('should update question successfully', async () => {
            const chain = mockDrizzleDb as any;
            chain.update.mockReturnValue(chain);
            chain.set.mockReturnValue(chain);
            chain.where.mockResolvedValue({});

            const result = await questionService.update(1, { content: '更新后的内容' });

            expect(result).toBe(true);
        });

        it('should handle options and tags stringification', async () => {
            const chain = mockDrizzleDb as any;
            chain.update.mockReturnValue(chain);
            chain.set.mockReturnValue(chain);
            chain.where.mockResolvedValue({});

            const result = await questionService.update(1, { 
                content: '更新内容',
                options: ['A', 'B'],
                tags: ['数学']
            });

            expect(result).toBe(true);
        });
    });

    describe('delete', () => {
        it('should delete question successfully', async () => {
            const chain = mockDrizzleDb as any;
            chain.delete.mockReturnValue(chain);
            chain.where.mockResolvedValue({});

            const result = await questionService.delete(1);

            expect(result).toBe(true);
        });
    });

    describe('bulkCreate', () => {
        it('should bulk create questions in transaction', async () => {
            const questions = [
                { content: 'Q1', type: 'single', answer: 'A', options: ['A', 'B'], tags: ['test'] },
                { content: 'Q2', type: 'single', answer: 'B', options: ['A', 'B'], tags: ['test'] }
            ];

            const mockTransaction = vi.fn();
            mockDrizzleDb.transaction.mockImplementation(mockTransaction);

            await questionService.bulkCreate(questions);

            expect(mockDrizzleDb.transaction).toHaveBeenCalled();
        });
    });

    describe('searchSimilarQuestions', () => {
        it('should return similar questions when vector search works', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1, 0.2]);
            
            const mockResults = [
                { id: 1, content: 'Test1 内容足够长', options: '["A", "B"]', answer: 'A', explanation: '解析内容足够长', tags: '["test"]', type: 'single', dimension: 'knowledge', distance: 0.5 }
            ];
            (mockDrizzleDb.all as any).mockResolvedValue(mockResults);

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
            expect(mockRagService.getEmbedding).toHaveBeenCalledWith('content');
        });

        it('should return empty list if vector extension missing', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1]);
            (mockDrizzleDb.all as any).mockRejectedValueOnce(new Error('no vec'));

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual([]);
        });

        it('should handle empty results', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1, 0.2]);
            (mockDrizzleDb.all as any).mockResolvedValue([]);

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual([]);
        });
    });
});
