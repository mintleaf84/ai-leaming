// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from '../../__tests__/test-db-utils';

// Mock DB 基础设施接入
const { mockDbInstance } = vi.hoisted(() => ({
    mockDbInstance: {
        db: null as any,
        prepare: (sql: string) => mockDbInstance.db.prepare(sql)
    }
}));
vi.mock('@/lib/db', () => ({ default: mockDbInstance, db: mockDbInstance, drizzleDb: {}, drizzleSchema: {} }));

import { schedulingService, calculateSessionRatios } from '../scheduling';

describe('Scheduling Service (Integration)', () => {
    let helper: TestDbHelper;

    beforeEach(() => {
        helper = setupTestDb();
        mockDbInstance.db = helper.db;
        
        // 准备两个用户用于隔离测试
        helper.seedUser(1, 'user1');
        helper.seedUser(2, 'user2');

        // 准备 10 道题目数据
        const insertQ = helper.db.prepare("INSERT INTO questions (id, content, tags) VALUES (?, ?, ?)");
        for (let i = 1; i <= 10; i++) {
            // 前 3 题带 Math 标签
            const tags = i <= 3 ? '["Math"]' : '["Others"]';
            insertQ.run(i, `Question ${i}`, tags);
        }
    });

    afterEach(() => {
        helper.close();
    });

    describe('calculateSessionRatios', () => {
        it('应该按照 40/40/20 比例正确计算权重', () => {
            expect(calculateSessionRatios(10)).toEqual({ stubborn: 4, blind: 4, regular: 2 });
            expect(calculateSessionRatios(1)).toEqual({ stubborn: 0, blind: 0, regular: 1 });
        });
    });

    describe('generateSession', () => {
        it('应该优先从用户专属的观察区（Stubborn）提取题目', () => {
            // 给用户 1 设置 Math 为观察区
            helper.db.prepare("INSERT INTO user_mastery (user_id, tag_name) VALUES (1, 'Math')").run();
            helper.db.prepare("INSERT INTO observation_zone (user_id, tag_name, status) VALUES (1, 'Math', 'active')").run();

            // 提取 3 题，Stubborn 占比应为 floor(3*0.4) = 1
            const session = schedulingService.generateSession(1, 3);
            
            // 必然包含一道 ID 在 1-3 之间的题目（Math 标签）
            expect(session.some(q => q.id >= 1 && q.id <= 3)).toBe(true);
        });

        it('多用户隔离：用户 A 的练习记录不应影响用户 B 的“盲区”判断', () => {
            // 场景：只有 10 道题。用户 1 练习了 ID 为 1-5 的题目。
            const insertLog = helper.db.prepare("INSERT INTO practice_logs (user_id, question_id, is_correct) VALUES (?, ?, 1)");
            for (let i = 1; i <= 5; i++) {
                insertLog.run(1, i);
            }

            // 用户 2 还没做过题。对用户 2 来说，所有题目都是“盲区”。
            const sessionForUser2 = schedulingService.generateSession(2, 10);
            expect(sessionForUser2).toHaveLength(10);
            
            // 对用户 1 来说，盲区应该只有 6-10 (40% 占比时应抽出 4 道)
            const sessionForUser1 = schedulingService.generateSession(1, 10);
            const blindIdsForUser1 = sessionForUser1.filter(q => q.id > 5);
            expect(blindIdsForUser1.length).toBeGreaterThanOrEqual(4);
        });

        it('当数据不足以填满权重时，应该能优雅降级（由 Regular 补齐）', () => {
            // 只有 10 题的情况下申请 100 题
            const session = schedulingService.generateSession(1, 100);
            expect(session.length).toBeLessThanOrEqual(10);
        });
    });
});
