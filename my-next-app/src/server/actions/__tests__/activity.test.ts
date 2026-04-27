// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { getUserActivityAction, getActivityStatsAction } from '../activity';

vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

describe('Activity Actions (使用全局 Manual Mock)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
    });

    describe('getUserActivityAction', () => {
        it('应该返回分页的练习流水记录', async () => {
            const { requireRole } = await import('@/lib/auth/auth');
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            const mockLogs = [
                {
                    id: 1,
                    user_id: 2,
                    username: 'student1',
                    question_id: 10,
                    question_content: '测试题目内容',
                    is_correct: 1,
                    duration_ms: 5000,
                    timestamp: '2024-03-30T10:00:00Z',
                    dimension: 'knowledge'
                }
            ];

            // 第一次返回 count，第二次返回 logs
            (drizzleDb as any).then
                .mockImplementationOnce((resolve: any) => resolve([{ count: 100 }]))
                .mockImplementationOnce((resolve: any) => resolve(mockLogs));

            const result = await getUserActivityAction(10, 0);

            expect(result.total).toBe(100);
            expect(result.logs[0].is_correct).toBe(true);
            expect(drizzleDb.select).toHaveBeenCalled();
        });
    });

    describe('getActivityStatsAction', () => {
        it('应该返回今日统计概览', async () => {
            const { requireRole } = await import('@/lib/auth/auth');
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            // 三次查询：今日总数、正确率与平均耗时、AI 使用情况
            (drizzleDb as any).then
                .mockImplementationOnce((resolve: any) => resolve([{ count: 42 }]))
                .mockImplementationOnce((resolve: any) => resolve([{ accuracy: 75.5, avgDuration: 8500 }]))
                .mockImplementationOnce((resolve: any) => resolve([{ count: 10, tokens: 15000 }]));

            const stats = await getActivityStatsAction();

            expect(stats.todayCount).toBe(42);
            expect(stats.accuracyRate).toBe(76);
            expect(stats.avgDurationMs).toBe(8500);
        });
    });
});
