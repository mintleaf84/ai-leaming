// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. 使用 hoisted 定义 Mock 链
const { mockDrizzleDb } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = [
            'select', 'from', 'where', 'limit', 'offset', 'orderBy', 
            'innerJoin', 'leftJoin', 'insert', 'values', 'update', 'set', 'delete'
        ];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };
    return { mockDrizzleDb: makeChain() };
});

// 2. 注册 Mock
vi.mock('@/lib/db', () => ({
    drizzleDb: mockDrizzleDb,
}));

// Mock Schema
vi.mock('@/lib/db/drizzle-schema', () => ({
    users: { id: 'users.id', username: 'users.username' },
    questions: { id: 'questions.id', content: 'questions.content', dimension: 'questions.dimension' },
    practice_logs: { 
        id: 'practice_logs.id', 
        user_id: 'practice_logs.user_id', 
        is_correct: 'practice_logs.is_correct',
        timestamp: 'practice_logs.timestamp',
        duration_ms: 'practice_logs.duration_ms',
        question_id: 'practice_logs.question_id'
    },
    api_call_logs: {
        created_at: 'api_call_logs.created_at',
        success: 'api_call_logs.success',
        input_tokens: 'api_call_logs.input_tokens',
        output_tokens: 'api_call_logs.output_tokens'
    }
}));

vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

describe('Activity Actions (Drizzle 重构版)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const chain = mockDrizzleDb as any;
        [
            'select', 'from', 'where', 'limit', 'offset', 'orderBy', 
            'innerJoin', 'leftJoin'
        ].forEach(m => chain[m].mockReturnValue(chain));
        chain.then.mockImplementation((resolve: any) => resolve([]));
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

            const chain = mockDrizzleDb as any;
            // 第一次返回 count，第二次返回 logs
            chain.then
                .mockImplementationOnce((resolve: any) => resolve([{ count: 100 }]))
                .mockImplementationOnce((resolve: any) => resolve(mockLogs));

            const { getUserActivityAction } = await import('../activity');
            const result = await getUserActivityAction(10, 0);

            expect(result.total).toBe(100);
            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].is_correct).toBe(true); // 验证 Boolean 转换
            expect(chain.select).toHaveBeenCalled();
        });
    });

    describe('getActivityStatsAction', () => {
        it('应该返回今日统计概览', async () => {
            const { requireRole } = await import('@/lib/auth/auth');
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            const chain = mockDrizzleDb as any;
            // 三次查询：今日总数、正确率与平均耗时、AI 使用情况
            chain.then
                .mockImplementationOnce((resolve: any) => resolve([{ count: 42 }])) // todayCount
                .mockImplementationOnce((resolve: any) => resolve([{ accuracy: 75.5, avgDuration: 8500 }])) // stats
                .mockImplementationOnce((resolve: any) => resolve([{ count: 10, tokens: 15000 }])); // aiStats

            const { getActivityStatsAction } = await import('../activity');
            const stats = await getActivityStatsAction();

            expect(stats.todayCount).toBe(42);
            expect(stats.accuracyRate).toBe(76); // Math.round(75.5)
            expect(stats.avgDurationMs).toBe(8500);
            expect(stats.aiTokensToday).toBe(15000);
        });
    });
});
