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
    drizzleSchema: actualSchema,
    db: {} // Legacy
}));

import { schedulingService, calculateSessionRatios } from '../scheduling';

describe('Scheduling Service (Integration - Real DB)', () => {
    let dbHelper: any;

    beforeEach(async () => {
        dbHelper = await setupVitestMemoryDb();
        mockDbHolder.db = dbHelper.db;
        const db = dbHelper.db;

        // 初始化基础数据
        await db.insert(schema.users).values([
            { id: 1, username: 'user1', password_hash: 'hash', role: 'student' },
            { id: 2, username: 'user2', password_hash: 'hash', role: 'student' }
        ]);

        // 准备 10 道题目数据
        for (let i = 1; i <= 10; i++) {
            const tags = i <= 3 ? '["Math"]' : '["Others"]';
            await db.insert(schema.questions).values({
                id: i,
                content: `Question ${i}`,
                tags,
                options: '["A", "B"]',
                dimension: 'knowledge',
                type: 'single'
            });
        }
    });

    afterEach(async () => {
        if (dbHelper) {
            await dbHelper.close();
        }
        mockDbHolder.db = null;
    });

    describe('calculateSessionRatios', () => {
        it('应该按照 40/40/20 比例正确计算权重', () => {
            expect(calculateSessionRatios(10)).toEqual({ stubborn: 4, blind: 4, regular: 2 });
            expect(calculateSessionRatios(1)).toEqual({ stubborn: 0, blind: 0, regular: 1 });
        });
    });

    describe('generateSession', () => {
        it('应该优先从用户专属的观察区（Stubborn）提取题目', async () => {
            const db = dbHelper.db;
            // 给用户 1 设置 Math 为观察区
            await db.insert(schema.observation_zone).values({
                user_id: 1,
                tag_name: 'Math',
                status: 'active'
            });

            // 提取 3 题，Stubborn 占比应为 floor(3*0.4) = 1
            const session = await schedulingService.generateSession(1, 3);
            
            expect(session.some(q => q.id >= 1 && q.id <= 3)).toBe(true);
            expect(session).toHaveLength(3);
        });

        it('多用户隔离：用户 A 的练习记录不应影响用户 B 的“盲区”判断', async () => {
            const db = dbHelper.db;
            // 用户 1 练习了 ID 为 1-5 的题目
            for (let i = 1; i <= 5; i++) {
                await db.insert(schema.practice_logs).values({
                    user_id: 1,
                    question_id: i,
                    is_correct: true,
                    duration_ms: 1000
                });
            }

            // 用户 2 还没做过题。对用户 2 来说，所有题目都是“盲区”。
            const sessionForUser2 = await schedulingService.generateSession(2, 10);
            expect(sessionForUser2).toHaveLength(10);
            
            // 对用户 1 来说，盲区应该只有 6-10 (40% 占比时应抽出 4 道)
            const sessionForUser1 = await schedulingService.generateSession(1, 10);
            const blindIdsForUser1 = sessionForUser1.filter(q => q.id > 5);
            expect(blindIdsForUser1.length).toBeGreaterThanOrEqual(4);
        });

        it('当数据不足以填满权重时，应该能优雅降级（由 Regular 补齐）', async () => {
            const session = await schedulingService.generateSession(1, 100);
            expect(session.length).toBeLessThanOrEqual(10);
        });
    });
});
