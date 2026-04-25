// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. 使用 BetterDbMock 增强 Mock 机制
// 注意：vi.hoisted 中的动态 import 是现代 Vitest 的推荐做法
const { mockBetterDb } = await vi.hoisted(async () => {
    const { createBetterDbMock } = await import('../../../lib/__tests__/db-mock-utils');
    return {
        mockBetterDb: createBetterDbMock()
    };
});

vi.mock('@/lib/db', () => ({ default: mockBetterDb, db: mockBetterDb, drizzleDb: {}, drizzleSchema: {} }));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 })
}));

vi.mock('@/lib/utils/datetime', () => ({
    getBeijingDateString: vi.fn((d) => d ? d.toISOString().split('T')[0] : '2024-01-15'),
    getBeijingYesterdayString: vi.fn().mockReturnValue('2024-01-14'),
    formatBeijingDisplayDate: vi.fn((_d) => '01/15')
}));

import { getUserStatsAction, getPracticeTrendAction } from '../stats';

describe('Stats Actions (Enhanced Mock)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('getUserStatsAction', () => {
        it('应该通过 BetterDbMock 正确聚合各项统计数据', async () => {
            // 设置更真实的 Mock 返回逻辑
            mockBetterDb._mockGet.mockImplementation(() => {
                const sql = mockBetterDb.getLastSqlCall().sql.toLowerCase();
                
                if (sql.includes('practice_logs')) {
                    if (sql.includes('date(timestamp)')) return { count: 10 }; // 今日已做
                    if (sql.includes('is_correct = 0')) return { count: 3 };    // 待复习
                    return { count: 500 }; // 累计
                }
                if (sql.includes('user_mastery') && sql.includes('avg')) return { avg: 85.6 };
                if (sql.includes('practice_sessions')) return { id: 'session-789' };
                if (sql.includes('observation_zone')) return { count: 5 };
                
                return { count: 0 };
            });

            mockBetterDb._mockAll.mockImplementation(() => {
                const sql = mockBetterDb.getLastSqlCall().sql.toLowerCase();

                if (sql.includes('user_mastery')) return [{ tag: 'React', score: 30 }]; // 弱点
                if (sql.includes('practice_logs') && sql.includes('distinct')) {
                    return [
                        { practice_date: '2024-01-15' }, 
                        { practice_date: '2024-01-14' },
                        { practice_date: '2024-01-13' }
                    ]; // 连续 3 天
                }
                return [];
            });

            const result = await getUserStatsAction();

            // 验证聚合结果
            expect(result.totalPracticed).toBe(500);
            expect(result.averageMastery).toBe(86); // Math.round(85.6)
            expect(result.streakDays).toBe(3);
            expect(result.todayPracticed).toBe(10);
            expect(result.dailyProgress).toBe(40); // (10 / 25) * 100
            expect(result.lastSessionId).toBe('session-789');

            // 严谨验证：检查是否对正确的表进行了查询
            const calls = mockBetterDb._state.calls;
            expect(calls.some((c: { sql: string }) => c.sql.includes('practice_logs'))).toBe(true);
            expect(calls.some((c: { sql: string }) => c.sql.includes('user_mastery'))).toBe(true);
        });
    });

    describe('getPracticeTrendAction', () => {
        it('应该返回带有填充日期的趋势数据', async () => {
            mockBetterDb._mockAll.mockImplementation(() => [
                { date: '2024-01-15', practiced: 20, correct: 18 }
            ]);

            const result = await getPracticeTrendAction(2);

            expect(result).toHaveLength(2);
            expect(result[1].date).toBe('2024-01-15');
            expect(result[1].practiced).toBe(20);
            expect(result[1].accuracy).toBe(90); // 18/20
            
            expect(result[0].practiced).toBe(0); // 填充日期应为 0
        });
    });
});
