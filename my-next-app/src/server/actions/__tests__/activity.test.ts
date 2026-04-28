// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '@/lib/db/drizzle-schema';
import { setupVitestMemoryDb } from '@/lib/__tests__/db-mock-utils';

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
    drizzleSchema: actualSchema
}));

vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn().mockResolvedValue({ id: 1, role: 'admin' }),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

import { getUserActivityAction, getActivityStatsAction } from '../activity';

describe('Activity Actions (Real DB)', () => {
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

    describe('getUserActivityAction', () => {
        it('应该返回分页的练习流水记录', async () => {
            const db = dbHelper.db;
            
            // 真实插入数据
            await db.insert(schema.users).values({ id: 1, username: 'student1', password_hash: 'hash' });
            await db.insert(schema.questions).values({
                id: 10,
                content: '测试题目内容',
                options: '[]',
                answer: 'A',
                explanation: '解析',
                tags: '[]',
                dimension: 'knowledge'
            });
            await db.insert(schema.practice_sessions).values({
                id: 'session-1',
                user_id: 1,
                practice_mode: 'normal'
            });
            await db.insert(schema.practice_logs).values({
                id: 1,
                session_id: 'session-1',
                user_id: 1,
                question_id: 10,
                user_answer: 'A',
                is_correct: 1,
                duration_ms: 5000,
                timestamp: new Date().toISOString()
            });

            const result = await getUserActivityAction(10, 0);

            expect(result.total).toBe(1);
            expect(result.logs).toHaveLength(1);
            expect(result.logs[0].is_correct).toBe(true);
            expect(result.logs[0].username).toBe('student1');
        });
    });

    describe('getActivityStatsAction', () => {
        it('应该返回今日统计概览', async () => {
            const db = dbHelper.db;
            
            await db.insert(schema.users).values({ id: 1, username: 'admin', password_hash: 'hash' });
            await db.insert(schema.questions).values({ id: 101, content: 'Q1', answer: 'A', is_correct: 1 } as any);
            await db.insert(schema.questions).values({ id: 102, content: 'Q2', answer: 'A', is_correct: 1 } as any);
            await db.insert(schema.practice_sessions).values({ id: 's-stats', user_id: 1 });
            
            await db.insert(schema.practice_logs).values([
                { user_id: 1, session_id: 's-stats', question_id: 101, is_correct: 1, duration_ms: 8000, timestamp: new Date().toISOString() },
                { user_id: 1, session_id: 's-stats', question_id: 102, is_correct: 0, duration_ms: 9000, timestamp: new Date().toISOString() }
            ]);

            const stats = await getActivityStatsAction();

            expect(stats.todayCount).toBe(2);
            expect(stats.accuracyRate).toBe(50);
            expect(stats.avgDurationMs).toBe(8500);
        });
    });
});
