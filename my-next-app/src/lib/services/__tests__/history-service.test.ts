// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { historyService } from '../history';

const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

describe('History Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getHistory', () => {
        it('should return paginated history', async () => {
            const mockCount = { count: 20 };
            const mockItems = [{ id: 's1', totalQuestions: 10, correctCount: 8, createdApp: '2023-01-01' }];

            mockDb.prepare
                .mockReturnValueOnce({ get: () => mockCount })
                .mockReturnValueOnce({ all: () => mockItems });

            const result = await historyService.getHistory(1, { page: 1, pageSize: 10 });

            expect(result.total).toBe(20);
            expect(result.items).toHaveLength(1);
            expect(result.items[0].accuracy).toBe(80);
            expect(result.totalPages).toBe(2);
        });

        it('should apply filters', async () => {
            const mockCount = { count: 1 };
            const mockItems = [{ id: 's1', totalQuestions: 10, correctCount: 10 }]; // 100% acc

            mockDb.prepare
                .mockReturnValueOnce({ get: () => mockCount })
                .mockReturnValueOnce({ all: () => mockItems });

            const result = await historyService.getHistory(1, {
                dateFrom: '2023-01-01',
                accuracyMin: 90
            });

            // Verify SQL contains date filter
            const sqlCall = mockDb.prepare.mock.calls[0][0];
            expect(sqlCall).toContain('date(created_at) >= date(?)');

            // Verify accuracy filtering (in memory)
            expect(result.items).toHaveLength(1);
        });

        it('should filter out items by accuracy', async () => {
            const mockCount = { count: 1 };
            const mockItems = [{ id: 's1', totalQuestions: 10, correctCount: 5 }]; // 50% acc

            mockDb.prepare
                .mockReturnValueOnce({ get: () => mockCount })
                .mockReturnValueOnce({ all: () => mockItems });

            const result = await historyService.getHistory(1, { accuracyMin: 80 });

            expect(result.items).toHaveLength(0); // Filtered out
        });
    });

    describe('getSessionDetail', () => {
        it('should return session and logs', async () => {
            const mockSession = { id: 's1', totalQuestions: 10, correctCount: 8 };
            const mockLogs = [
                {
                    questionId: 1,
                    options: '["A"]',
                    tags: '["tag1"]',
                    isCorrect: 1
                }
            ];

            mockDb.prepare
                .mockReturnValueOnce({ get: () => mockSession })
                .mockReturnValueOnce({ all: () => mockLogs });

            const result = await historyService.getSessionDetail('s1', 1);

            expect(result).not.toBeNull();
            expect(result?.session.id).toBe('s1');
            expect(result?.logs).toHaveLength(1);
            expect(result?.logs[0].options).toEqual(['A']);
            expect(result?.logs[0].isCorrect).toBe(true);
        });

        it('should return null if not found', async () => {
            mockDb.prepare.mockReturnValueOnce({ get: () => null });

            const result = await historyService.getSessionDetail('s1', 1);

            expect(result).toBeNull();
        });
    });
});
