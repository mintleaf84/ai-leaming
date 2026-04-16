// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 数据库模块
const mockDb = vi.hoisted(() => ({
    prepare: vi.fn()
}));
vi.mock('@/lib/db', () => ({ default: mockDb }));

// Mock Auth 中间件
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

import app from '../profile';

describe('Profile Hono 路由', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function mockPrepareGet(returnValue: any) {
        return { get: vi.fn().mockReturnValue(returnValue) };
    }

    it('GET / - 返回完整的用户信息', async () => {
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({
                id: 1, username: 'testuser', role: 'student', created_at: '2024-01-01'
            }))
            .mockReturnValueOnce(mockPrepareGet({ count: 10 }))              // totalSessions
            .mockReturnValueOnce(mockPrepareGet({ total: 100, correct: 75 })) // 答题统计
            .mockReturnValueOnce(mockPrepareGet({ count: 20 }))              // 知识卡片数
            .mockReturnValueOnce(mockPrepareGet({ count: 5 }));               // 错题数

        const res = await app.request('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.id).toBe(1);
        expect(data.username).toBe('testuser');
        expect(data.role).toBe('student');
        expect(data.stats.totalSessions).toBe(10);
        expect(data.stats.totalAnswered).toBe(100);
        expect(data.stats.totalCorrect).toBe(75);
        expect(data.stats.overallAccuracy).toBeCloseTo(0.75);
        expect(data.stats.knowledgeCardCount).toBe(20);
        expect(data.stats.wrongBookCount).toBe(5);
    });

    it('GET / - 用户不存在时返回 404', async () => {
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet(undefined)); // 查不到用户

        const res = await app.request('/');
        expect(res.status).toBe(404);
    });

    it('GET / - 无练习记录时 overallAccuracy 为 0', async () => {
        mockDb.prepare
            .mockReturnValueOnce(mockPrepareGet({
                id: 1, username: 'newuser', role: 'student', created_at: '2024-01-01'
            }))
            .mockReturnValueOnce(mockPrepareGet({ count: 0 }))
            .mockReturnValueOnce(mockPrepareGet({ total: 0, correct: null }))
            .mockReturnValueOnce(mockPrepareGet({ count: 0 }))
            .mockReturnValueOnce(mockPrepareGet({ count: 0 }));

        const res = await app.request('/');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.overallAccuracy).toBe(0);
    });
});
