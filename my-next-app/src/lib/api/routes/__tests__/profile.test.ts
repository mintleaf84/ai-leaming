// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupVitestMemoryDb } from '@/lib/__tests__/db-mock-utils';
import * as schema from '@/lib/db/drizzle-schema';

// 1. 设置数据库 Mock 持有者
const { actualSchema, mockDbHolder } = await vi.hoisted(async () => {
    const modSchema = await import('@/lib/db/drizzle-schema');
    return { 
        actualSchema: modSchema,
        mockDbHolder: { db: null as any }
    };
});

// 2. Mock 数据库模块
vi.mock('@/lib/db', () => ({
    drizzleDb: new Proxy({}, {
        get: (_, prop) => {
            if (!mockDbHolder.db) {
                throw new Error('测试数据库尚未初始化');
            }
            return mockDbHolder.db[prop];
        }
    }),
    drizzleSchema: actualSchema,
    db: {} // 兼容旧版引用
}));

// Mock Auth 中间件
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

import app from '../profile';

describe('Profile Hono 路由 (Real DB)', () => {
    let dbHelper: any;

    beforeEach(async () => {
        dbHelper = await setupVitestMemoryDb();
        mockDbHolder.db = dbHelper.db;
        vi.clearAllMocks();
    });

    afterEach(async () => {
        if (dbHelper) {
            await dbHelper.close();
        }
        mockDbHolder.db = null;
    });

    it('GET / - 返回完整的用户信息', async () => {
        const db = dbHelper.db;
        
        // 预置数据
        try {
            await db.insert(schema.users).values({ id: 1, username: 'testuser', password_hash: 'hash' });
        } catch (e) { console.error('BINGO users', e); throw e; }

        try {
            await db.insert(schema.questions).values([{ id: 101, content: 'Q1' }, { id: 102, content: 'Q2' }]);
        } catch (e) { console.error('BINGO questions', e); throw e; }

        try {
            await db.insert(schema.practice_sessions).values({ id: 's1', user_id: 1 });
        } catch (e) { console.error('BINGO sessions', e); throw e; }

        try {
            await db.insert(schema.practice_logs).values([
                { user_id: 1, session_id: 's1', question_id: 101, is_correct: true, duration_ms: 1000 },
                { user_id: 1, session_id: 's1', question_id: 102, is_correct: false, duration_ms: 1000 }
            ]);
        } catch (e) { console.error('BINGO logs', e); throw e; }

        try {
            await db.insert(schema.knowledge_cards).values({ user_id: 1, title: 'Card 1' });
        } catch (e) { console.error('BINGO cards', e); throw e; }
        
        // 错题数需要未掌握。
        // 由于没有 mastered_questions 记录，所以这 1 个错题会被计入。

        const res = await app.request('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.id).toBe(1);
        expect(data.username).toBe('testuser');
        expect(data.stats.totalSessions).toBe(1);
        expect(data.stats.totalAnswered).toBe(2);
        expect(data.stats.totalCorrect).toBe(1);
        expect(data.stats.overallAccuracy).toBe(0.5);
        expect(data.stats.knowledgeCardCount).toBe(1);
        expect(data.stats.wrongBookCount).toBe(1);
    });

    it('GET / - 用户不存在时返回 404', async () => {
        const res = await app.request('/');
        expect(res.status).toBe(404);
    });

    it('GET / - 无练习记录时 overallAccuracy 为 0', async () => {
        const db = dbHelper.db;
        await db.insert(schema.users).values({
            id: 1, username: 'newuser', password_hash: 'hash', role: 'student', created_at: '2024-01-01'
        });

        const res = await app.request('/');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.overallAccuracy).toBe(0);
    });
});
