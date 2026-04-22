// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    }
});

vi.mock('@/lib/db', () => ({ default: mockDb, db: mockDb, drizzleDb: {}, drizzleSchema: {} }));

vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn(),
}));

import { getUserActivityAction, getActivityStatsAction } from '../activity';
import { requireRole } from '@/lib/auth/auth';

describe('Activity Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUserActivityAction', () => {
        it('应该返回分页的练习流水记录', async () => {
            // Mock 权限检查
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            // Mock DB
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 100 }) };
                }
                if (sql.includes('SELECT') && sql.includes('FROM practice_logs')) {
                    return {
                        all: () => [
                            {
                                id: 1,
                                user_id: 2,
                                username: 'student1',
                                question_id: 10,
                                question_content: '测试题目内容',
                                user_answer: 'A',
                                is_correct: 1,
                                duration_ms: 5000,
                                timestamp: '2024-03-30T10:00:00Z',
                                dimension: 'knowledge'
                            }
                        ]
                    };
                }
                return { get: () => null, all: () => [] };
            });

            const result = await getUserActivityAction(10, 0);

            expect(result.total).toBe(100);
            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].is_correct).toBe(true); // 验证 boolean 转换
            expect(mockDb.prepare).toHaveBeenCalledTimes(2);
        });

        it('应该支持按用户筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation(() => ({
                get: () => ({ count: 5 }),
                all: () => []
            }));

            await getUserActivityAction(10, 0, { userId: 2 });

            const lastCall = mockDb.prepare.mock.calls[0][0];
            expect(lastCall).toContain('pl.user_id = ?');
        });

        it('应该支持按对错筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation(() => ({
                get: () => ({ count: 5 }),
                all: () => []
            }));

            await getUserActivityAction(10, 0, { isCorrect: false });

            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('pl.is_correct = ?');
        });

        it('应该支持关键词搜索 (用户名和题干)', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation(() => ({
                get: () => ({ count: 5 }),
                all: () => []
            }));

            await getUserActivityAction(10, 0, { search: '心理' });

            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('(u.username LIKE ? OR q.content LIKE ?)');
        });
    });

    describe('getActivityStatsAction', () => {
        it('应该返回今日统计概览', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                const s = sql.toLowerCase();
                if (s.includes('count(*)') && s.includes('from practice_logs')) {
                    if (s.includes('is_correct')) return { get: () => ({ rate: 75.5 }) };
                    return { get: () => ({ count: 42 }) };
                }
                if (s.includes('avg(duration_ms)')) {
                    return { get: () => ({ avg_time: 8500 }) };
                }
                if (s.includes('from api_call_logs')) {
                    return { get: () => ({ count: 10, tokens: 15000 }) };
                }
                return { get: () => ({ count: 0, rate: 0, avg_time: 0, tokens: 0 }) };
            });

            const stats = await getActivityStatsAction();

            expect(stats.todayCount).toBe(42);
            expect(stats.accuracyRate).toBe(76); // Math.round(75.5)
            expect(stats.avgDurationMs).toBe(8500);
            expect(stats.aiTokensToday).toBe(15000);
        });

        it('当今日无数据时应返回默认值 0', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation(() => ({
                get: () => ({ count: 0, rate: 0, avg_time: null, tokens: null })
            }));

            const stats = await getActivityStatsAction();

            expect(stats.todayCount).toBe(0);
            expect(stats.avgDurationMs).toBe(0);
            expect(stats.aiTokensToday).toBe(0);
        });
    });
});
