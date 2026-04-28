// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from '../../__tests__/test-db-utils';
import { sql } from 'drizzle-orm';

// 使用 vi.hoisted 定义 Mock 容器，确保在 vi.mock 提升时已就绪
const { mockContainer } = vi.hoisted(() => ({
    mockContainer: {
        drizzleDb: null as any,
        drizzleSchema: null as any
    }
}));

vi.mock('@/lib/db', async () => {
    const schema = await vi.importActual('@/lib/db/drizzle-schema');
    mockContainer.drizzleSchema = schema;
    return {
        drizzleDb: new Proxy({}, {
            get: (_, prop) => mockContainer.drizzleDb?.[prop]
        }),
        drizzleSchema: schema,
        getLegacyDb: () => null,
    };
});

import { masteryService } from '../mastery';
import { user_mastery } from '@/lib/db/drizzle-schema';

describe('Mastery Service (Integration with Drizzle)', () => {
    let helper: TestDbHelper;

    beforeEach(async () => {
        helper = await setupTestDb();
        mockContainer.drizzleDb = helper.db;
        await helper.seedUser(1, 'testuser');
    });

    afterEach(async () => {
        await helper.close();
    });

    describe('updateMastery', () => {
        it('应该能够正确持久化分数（初始更新）', async () => {
            await masteryService.updateMastery(1, '教育心理学', 'knowledge', true);
            
            const result = await helper.db.run(sql`SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = 1 AND tag_name = '教育心理学'`);
            const row = result.rows[0] as any;
            
            expect(row.score).toBe(100);
            expect(row.correct_count).toBe(1);
            expect(row.total_count).toBe(1);
        });

        it('多次更新后分数计算应复合预期（准确率逻辑）', async () => {
            // 答对一次
            await masteryService.updateMastery(1, '教育心理学', 'knowledge', true);
            // 答错一次
            await masteryService.updateMastery(1, '教育心理学', 'knowledge', false);
            // 答错一次
            await masteryService.updateMastery(1, '教育心理学', 'knowledge', false);
            
            const result = await helper.db.run(sql`SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = 1 AND tag_name = '教育心理学'`);
            const row = result.rows[0] as any;
            
            // 1/3 = 33.333...
            expect(row.score).toBeCloseTo(33.33, 1);
            expect(row.correct_count).toBe(1);
            expect(row.total_count).toBe(3);
        });

        it('isMonitoredCorrect 为 true 时应增加总数但不增加正确数', async () => {
            // 模拟“可疑正确”（可能是 AI 辅助或侥幸）
            await masteryService.updateMastery(1, '教育心理学', 'knowledge', true, true);
            
            const result = await helper.db.run(sql`SELECT score FROM user_mastery WHERE user_id = 1 AND tag_name = '教育心理学'`);
            const row = result.rows[0] as any;
            
            expect(row.score).toBe(0); // 0/1 = 0
        });
    });

    describe('getHierarchyMastery', () => {
        beforeEach(async () => {
            await helper.db.run(sql`INSERT INTO user_mastery (user_id, tag_name, score) VALUES 
                (1, '教育心理学', 80),
                (1, '教育心理学/学习动机', 60),
                (1, '教育心理学/学习动机/强化理论', 100),
                (1, '教育学原理', 40)`);
        });

        it('应该通过 LIKE 算子正确统计父子层级的平均分', async () => {
            // 应该包含 教育心理学(80), 学习动机(60), 强化理论(100)
            const result = await masteryService.getHierarchyMastery(1, '教育心理学');
            
            expect(result.count).toBe(3);
            expect(result.avgScore).toBe(80); // (80+60+100)/3 = 80
        });

        it('如果没有匹配项应返回 0', async () => {
            const result = await masteryService.getHierarchyMastery(1, '不存在的路径');
            expect(result.avgScore).toBe(0);
            expect(result.count).toBe(0);
        });
    });

    describe('getMasteryTree', () => {
        it('应该正确还原分级路径为树形结构', async () => {
            await helper.db.run(sql`INSERT INTO user_mastery (user_id, tag_name, score) VALUES 
                (1, 'A', 10),
                (1, 'A/B', 20),
                (1, 'A/B/C', 30)`);

            const tree = await masteryService.getMasteryTree(1);

            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('A');
            expect(tree[0].children[0].name).toBe('B');
            expect(tree[0].children[0].children[0].name).toBe('C');
            expect(tree[0].children[0].children[0].score).toBe(30);
        });

        it('能够兼容处理非标准路径（父节点缺失）情况', async () => {
            await helper.db.run(sql`INSERT INTO user_mastery (user_id, tag_name, score) VALUES (1, 'X/Y/Z', 100)`);

            const tree = await masteryService.getMasteryTree(1);
            // 按照目前逻辑，父节点不存在时会作为根节点
            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('Z');
        });
    });
});
