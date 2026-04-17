// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 数据库模块（必须在 import app 之前）
const mockDb = vi.hoisted(() => ({
    prepare: vi.fn()
}));
vi.mock('@/lib/db', () => ({ default: mockDb }));

// Mock datetime 工具（无参数返回今天，有 Date 参数返回昨天）
vi.mock('@/lib/utils/datetime', () => ({
    getBeijingDateString: vi.fn((date?: Date) => date ? '2024-01-14' : '2024-01-15')
}));

// Mock Auth 中间件
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

import app from '../stats';

describe('Stats Hono 路由', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * 辅助函数：构造 mockDb.prepare 的链式调用桩
     * prepare(sql).get(...) => returnValue
     */
    function mockPrepareGet(returnValue: any) {
        return {
            get: vi.fn().mockReturnValue(returnValue)
        };
    }

    it('GET / - 返回正确的统计数据', async () => {
        // 按顺序 mock 4 次 prepare().get() 调用
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({ count: 5, correct: 4 }))       // 今日统计
            .mockReturnValueOnce(mockPrepareGet({ count: 100, correct: 80 }))    // 历史总统计
            .mockReturnValueOnce(mockPrepareGet({ count: 12 }))                   // 总会话数
            .mockReturnValueOnce({ all: vi.fn().mockReturnValue([              // 连续天数
                { day: '2024-01-15' },
                { day: '2024-01-14' },
                { day: '2024-01-13' },
            ]) });

        const res = await app.request('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.todayCount).toBe(5);
        expect(data.todayCorrect).toBe(4);
        expect(data.todayAccuracy).toBeCloseTo(0.8);
        expect(data.totalCount).toBe(100);
        expect(data.totalCorrect).toBe(80);
        expect(data.overallAccuracy).toBeCloseTo(0.8);
        expect(data.totalSessions).toBe(12);
        expect(data.streakDays).toBe(3);
    });

    it('GET / - 今日无练习记录时 accuracy 为 0', async () => {
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({ count: 0, correct: null }))
            .mockReturnValueOnce(mockPrepareGet({ count: 50, correct: 30 }))
            .mockReturnValueOnce(mockPrepareGet({ count: 5 }))
            .mockReturnValueOnce({ all: vi.fn().mockReturnValue([]) });

        const res = await app.request('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.todayCount).toBe(0);
        expect(data.todayAccuracy).toBe(0);
        expect(data.streakDays).toBe(0);
    });

    it('GET / - 历史无练习记录时 overallAccuracy 为 0', async () => {
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({ count: 0, correct: null }))
            .mockReturnValueOnce(mockPrepareGet({ count: 0, correct: null }))
            .mockReturnValueOnce(mockPrepareGet({ count: 0 }))
            .mockReturnValueOnce({ all: vi.fn().mockReturnValue([]) });

        const res = await app.request('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.overallAccuracy).toBe(0);
        expect(data.streakDays).toBe(0);
    });

    it('GET / - 昨天有记录（streak 应计入）', async () => {
        // 模拟今天无记录但昨天有，streak 应从昨天开始计
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({ count: 0, correct: null }))
            .mockReturnValueOnce(mockPrepareGet({ count: 20, correct: 15 }))
            .mockReturnValueOnce(mockPrepareGet({ count: 3 }))
            .mockReturnValueOnce({ all: vi.fn().mockReturnValue([
                { day: '2024-01-14' }, // 昨天
                { day: '2024-01-13' },
            ]) });

        const res = await app.request('/');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.streakDays).toBe(2);
    });
});
