import { describe, it, expect, beforeEach, vi } from 'vitest';
import { statsService } from '../stats';
import { drizzleDb } from '@/lib/db';

// Mock DB
vi.mock('@/lib/db', () => ({
    drizzleDb: {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
        limit: vi.fn(),
        groupBy: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
    },
    drizzleSchema: {}
}));

// Mock Datetime Utils
vi.mock('@/lib/utils/datetime', () => {
    const dayjs = require('dayjs');
    return {
        getBeijingDateString: vi.fn((d) => d ? d.toISOString().split('T')[0] : '2024-01-15'),
        getBeijingYesterdayString: vi.fn().mockReturnValue('2024-01-14'),
        formatBeijingDisplayDate: vi.fn((_d) => '01/15'),
        getBeijingNow: vi.fn(() => dayjs('2024-01-15T10:00:00Z'))
    };
});

describe('StatsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    });

    describe('getUserStats', () => {
        it('应该聚合所有核心指标', async () => {
            // 模拟 8 个并发查询的返回值
            // 按照 getUserStats 内部 Promise.all 的顺序
            const mockResponses = [
                { count: 500, correct: 400 }, // totalRes
                { value: 85.6 }, // masteryRes
                { count: 10, correct: 8 },  // todayRes
                { id: 'session-789' }, // lastSession
                { value: 3 },  // pendingReviewRes
                { value: 5 },  // observationRes
                [{ tag: 'React', score: 30 }], // weakPoints
                { value: 12 } // sessionCountRes
            ];

            let callIdx = 0;
            // 模拟链式调用
            const mockChain = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                get: vi.fn(() => mockResponses[callIdx++]),
                all: vi.fn(() => mockResponses[callIdx++]),
            };

            (drizzleDb.select as any).mockReturnValue(mockChain);

            // 模拟 getStreakDays (内部调用)
            vi.spyOn(statsService, 'getStreakDays').mockResolvedValue(3);

            const stats = await statsService.getUserStats(1);

            expect(stats.totalPracticed).toBe(500);
            expect(stats.totalCorrect).toBe(400);
            expect(stats.totalSessions).toBe(12);
            expect(stats.averageMastery).toBe(86);
            expect(stats.todayPracticed).toBe(10);
            expect(stats.todayCorrect).toBe(8);
            expect(stats.streakDays).toBe(3);
            expect(stats.dailyProgress).toBe(40); // (10 / 25) * 100
            expect(stats.weakPoints[0].tag).toBe('React');
        });
    });

    describe('getPracticeTrend', () => {
        it('应该填充趋势数据中的缺失日期', async () => {
            const mockRows = [
                { date: '2024-01-15', practiced: 20, correct: 18 }
            ];

            const mockChain = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                groupBy: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue(mockRows),
            };

            (drizzleDb.select as any).mockReturnValue(mockChain);

            const trend = await statsService.getPracticeTrend(1, 3); // 获取 3 天数据

            expect(trend).toHaveLength(3);
            // 最后一项是今天 (2024-01-15)
            expect(trend[2].date).toBe('2024-01-15');
            expect(trend[2].practiced).toBe(20);
            expect(trend[2].accuracy).toBe(90);

            // 前两项应该是补全的 0
            expect(trend[0].practiced).toBe(0);
            expect(trend[1].practiced).toBe(0);
        });
    });
});
