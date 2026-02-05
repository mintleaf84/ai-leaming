// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { questionService } from '../question';

// Mock DB
const { mockDb, mockRagService } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockRagService: {
            getEmbedding: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/ai/rag', () => ({
    ragService: mockRagService
}));

// Mock safe-query (since service uses it)
// safeGet/safeAll parse results with Zod. 
// We can mock the db.prepare().get/all return values to match what Zod expects (or successful parsing).
// However, the service calls safeGet/safeAll imported from '@/lib/db/safe-query'.
// It's better to mock them to avoid Zod schema complexity in tests, or test integration?
// Let's mock the DB return values to be valid according to Schema, so safeGet works. (Integration style for schemas)
// OR mock safeGet/safeAll. Mocking safeGet/safeAll is easier.

vi.mock('@/lib/db/safe-query', () => ({
    safeGet: vi.fn((_, __, ___) => _?.get ? _.get() : _), // Simple passthrough for mock
    safeAll: vi.fn((_, __, ___) => _?.all ? _.all() : _)
}));


describe('Question Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getById', () => {
        it('should return question when found', async () => {
            const mockQ = { id: 1, content: 'Test' };
            const mockGet = vi.fn().mockReturnValue(mockQ);
            mockDb.prepare.mockReturnValue({ get: mockGet });

            // Since we mocked safeGet to just call .get(), this works
            const result = await questionService.getById(1);

            expect(result).toEqual(mockQ);
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM questions'));
        });
    });

    describe('list', () => {
        it('should list questions with pagination', async () => {
            const mockItems = [{ id: 1 }, { id: 2 }];
            const mockAll = vi.fn().mockReturnValue(mockItems);
            const mockGetCount = vi.fn().mockReturnValue({ count: 10 });

            // First prepare is for listing, second for count
            mockDb.prepare
                .mockReturnValueOnce({ all: mockAll })
                .mockReturnValueOnce({ get: mockGetCount });

            const result = await questionService.list({ offset: 0, limit: 10 });

            expect(result.items).toEqual(mockItems);
            expect(result.total).toBe(10);
        });

        it('should apply mode filter', async () => {
            const mockAll = vi.fn().mockReturnValue([]);
            const mockGetCount = vi.fn().mockReturnValue({ count: 0 });
            mockDb.prepare.mockReturnValue({ all: mockAll, get: mockGetCount } as any);

            await questionService.list({ type: ['single'] });

            // Check if SQL contained type condition
            const listingSqlCall = mockDb.prepare.mock.calls[0][0];
            expect(listingSqlCall).toContain('type IN (?)');
        });
    });

    describe('searchSimilarQuestions', () => {
        it('should return similar questions when vector search works', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1, 0.2]);
            // Mock version check
            mockDb.prepare.mockReturnValueOnce({ get: () => 'v0.1.7' });

            const mockResults = [{ id: 1, distance: 0.5 }];
            mockDb.prepare.mockReturnValueOnce({ all: () => mockResults });

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual(mockResults);
            expect(mockRagService.getEmbedding).toHaveBeenCalledWith('content');
        });

        it('should return empty list if vector extension missing', async () => {
            mockRagService.getEmbedding.mockResolvedValue([0.1]);
            // Mock version check failure
            mockDb.prepare.mockImplementationOnce(() => { throw new Error('no vec'); });

            const result = await questionService.searchSimilarQuestions('content');

            expect(result).toEqual([]);
        });
    });
});
