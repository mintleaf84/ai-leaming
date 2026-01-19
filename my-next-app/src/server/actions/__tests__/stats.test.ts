// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserStatsAction, getPracticeTrendAction } from '../stats';

// Mock dependencies
const { mockDb, mockRequireUser } = vi.hoisted(() => {
    return {
        mockDb: { prepare: vi.fn() },
        mockRequireUser: vi.fn().mockResolvedValue({ id: 1 })
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));
vi.mock('@/lib/auth/auth', () => ({ requireUser: mockRequireUser }));

vi.mock('@/lib/utils/datetime', () => ({
    getBeijingDateString: vi.fn().mockReturnValue('2024-01-15'),
    getBeijingYesterdayString: vi.fn().mockReturnValue('2024-01-14'),
    formatBeijingDisplayDate: vi.fn((d) => '01/15')
}));

describe('Stats Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUserStatsAction', () => {
        it('should aggregate user stats correctly', async () => {
            const mockGet = vi.fn()
                .mockReturnValueOnce({ count: 100 }) // totalPracticed
                .mockReturnValueOnce({ avg: 75 }) // avgMastery
                .mockReturnValueOnce({ count: 5 }) // todayPracticed
                .mockReturnValueOnce({ id: 'session-1' }) // lastSession
                .mockReturnValueOnce({ count: 3 }) // pendingReview
                .mockReturnValueOnce({ count: 2 }); // observationZone

            const mockAll = vi.fn()
                .mockReturnValueOnce([{ tag: 'weak1', score: 40 }]) // weakPoints
                .mockReturnValueOnce([{ practice_date: '2024-01-15' }, { practice_date: '2024-01-14' }]); // streakDays

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('AVG') || sql.toLowerCase().includes('count(*)')) {
                    return { get: mockGet };
                }
                if (sql.includes('LIMIT 3') || sql.includes('DISTINCT date')) {
                    return { all: mockAll };
                }
                return { get: mockGet, all: mockAll };
            });

            const result = await getUserStatsAction();

            expect(result.totalPracticed).toBe(100);
            expect(result.averageMastery).toBe(75);
            expect(result.weakPoints).toHaveLength(1);
            expect(result.dailyProgress).toBe(20); // 5/25 * 100
        });
    });

    describe('getPracticeTrendAction', () => {
        it('should return trend with filled dates', async () => {
            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue([
                    { date: '2024-01-15', practiced: 10, correct: 8 }
                ])
            });

            const result = await getPracticeTrendAction(7);

            expect(result).toHaveLength(7);
            // Last date should have data
            const lastDay = result.find(r => r.date === '2024-01-15');
            expect(lastDay?.practiced).toBe(10);
            expect(lastDay?.accuracy).toBe(80);
        });
    });
});
