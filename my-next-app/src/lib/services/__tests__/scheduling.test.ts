// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from '../../__tests__/test-db-utils';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

// 定义一个持有状态的对象，用于在 vi.mock 和测试之间共享
const testState = vi.hoisted(() => ({
    activeDrizzle: null as any,
    mockSchema: {} as any
}));

// 应用 Mock
vi.mock('@/lib/db', () => ({
    drizzleDb: new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') return undefined;
            if (!testState.activeDrizzle) throw new Error('Drizzle not initialized in test');
            return testState.activeDrizzle[prop];
        }
    }),
    drizzleSchema: testState.mockSchema,
    db: {} // Legacy db
}));

// 填充 mockSchema
import * as actualSchema from '@/lib/db/drizzle-schema';
Object.assign(testState.mockSchema, actualSchema);

import { schedulingService, calculateSessionRatios } from '../scheduling';

describe('Scheduling Service (Integration)', () => {
    let helper: TestDbHelper;
    let drizzleDb: any;
    let client: any;

    beforeEach(async () => {
        helper = await setupTestDb();
        
        // 创建 LibSQL/Drizzle 内存实例
        client = createClient({ url: 'file::memory:', syncUrl: '' });
        drizzleDb = drizzle(client, { schema: actualSchema });
        testState.activeDrizzle = drizzleDb;

        // 初始化 Schema
        const initSql = helper.getSchemaSql();
        for (const statement of initSql.split(';')) {
            if (statement.trim()) {
                await client.execute(statement);
            }
        }
        
        // 核心修复：通过同一个 client 准备用户数据
        await client.execute({
            sql: "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            args: [1, 'user1', 'hash', 'student']
        });
        await client.execute({
            sql: "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            args: [2, 'user2', 'hash', 'student']
        });

        // 准备 10 道题目数据
        for (let i = 1; i <= 10; i++) {
            const tags = i <= 3 ? '["Math"]' : '["Others"]';
            await client.execute({
                sql: "INSERT INTO questions (id, content, tags, options, dimension, type) VALUES (?, ?, ?, ?, ?, ?)",
                args: [i, `Question ${i}`, tags, '["A", "B"]', 'knowledge', 'single']
            });
        }
    });

    afterEach(async () => {
        await helper.close();
        testState.activeDrizzle = null;
    });

    describe('calculateSessionRatios', () => {
        it('应该按照 40/40/20 比例正确计算权重', () => {
            expect(calculateSessionRatios(10)).toEqual({ stubborn: 4, blind: 4, regular: 2 });
            expect(calculateSessionRatios(1)).toEqual({ stubborn: 0, blind: 0, regular: 1 });
        });
    });

    describe('generateSession', () => {
        it('应该优先从用户专属的观察区（Stubborn）提取题目', async () => {
            // 给用户 1 设置 Math 为观察区
            await drizzleDb.insert(actualSchema.observation_zone).values({
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
            // 用户 1 练习了 ID 为 1-5 的题目
            for (let i = 1; i <= 5; i++) {
                await drizzleDb.insert(actualSchema.practice_logs).values({
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
