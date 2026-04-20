// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from '../../__tests__/test-db-utils';

// 必须在导入 service 之前进行 Mock
const { mockDbInstance } = vi.hoisted(() => ({
    mockDbInstance: {
        db: null as unknown,
        prepare: (sql: string) => mockDbInstance.db.prepare(sql),
        transaction: (fn: unknown) => mockDbInstance.db.transaction(fn)
    }
}));

vi.mock('@/lib/db', () => ({
    default: mockDbInstance
}));

import { masteryService } from '../mastery';

describe('Mastery Service (Integration)', () => {
    let helper: TestDbHelper;

    beforeEach(() => {
        helper = setupTestDb();
        mockDbInstance.db = helper.db;
        helper.seedUser(1, 'testuser');
    });

    afterEach(() => {
        helper.close();
    });

    describe('updateMastery', () => {
        it('应该能够正确持久化分数（初始更新）', () => {
            masteryService.updateMastery(1, '教育心理学', 'knowledge', true);
            
            const row = helper.db.prepare('SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = 1 AND tag_name = ?')
                .get('教育心理学') as unknown;
            
            expect(row.score).toBe(100);
            expect(row.correct_count).toBe(1);
            expect(row.total_count).toBe(1);
        });

        it('多次更新后分数计算应复合预期（准确率逻辑）', () => {
            // 答对一次
            masteryService.updateMastery(1, '教育心理学', 'knowledge', true);
            // 答错一次
            masteryService.updateMastery(1, '教育心理学', 'knowledge', false);
            // 答错一次
            masteryService.updateMastery(1, '教育心理学', 'knowledge', false);
            
            const row = helper.db.prepare('SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = 1 AND tag_name = ?')
                .get('教育心理学') as unknown;
            
            // 1/3 = 33.333...
            expect(row.score).toBeCloseTo(33.33, 1);
            expect(row.correct_count).toBe(1);
            expect(row.total_count).toBe(3);
        });

        it('isMonitoredCorrect 为 true 时应增加总数但不增加正确数', () => {
            // 模拟“可疑正确”（可能是 AI 辅助或侥幸）
            masteryService.updateMastery(1, '教育心理学', 'knowledge', true, true);
            
            const row = helper.db.prepare('SELECT score FROM user_mastery WHERE user_id = 1 AND tag_name = ?').get('教育心理学') as unknown;
            
            expect(row.score).toBe(0); // 0/1 = 0
        });
    });

    describe('getHierarchyMastery', () => {
        beforeEach(() => {
            const stmt = helper.db.prepare('INSERT INTO user_mastery (user_id, tag_name, score) VALUES (1, ?, ?)');
            stmt.run('教育心理学', 80);
            stmt.run('教育心理学/学习动机', 60);
            stmt.run('教育心理学/学习动机/强化理论', 100);
            stmt.run('教育学原理', 40); // 干扰项
        });

        it('应该通过 LIKE 算子正确统计父子层级的平均分', () => {
            // 应该包含 教育心理学(80), 学习动机(60), 强化理论(100)
            const result = masteryService.getHierarchyMastery(1, '教育心理学');
            
            expect(result.count).toBe(3);
            expect(result.avgScore).toBe(80); // (80+60+100)/3 = 80
        });

        it('如果没有匹配项应返回 0', () => {
            const result = masteryService.getHierarchyMastery(1, '不存在的路径');
            expect(result.avgScore).toBe(0);
            expect(result.count).toBe(0);
        });
    });

    describe('getMasteryTree', () => {
        it('应该正确还原分级路径为树形结构', () => {
            const stmt = helper.db.prepare('INSERT INTO user_mastery (user_id, tag_name, score) VALUES (1, ?, ?)');
            stmt.run('A', 10);
            stmt.run('A/B', 20);
            stmt.run('A/B/C', 30);

            const tree = masteryService.getMasteryTree(1);

            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('A');
            expect(tree[0].children[0].name).toBe('B');
            expect(tree[0].children[0].children[0].name).toBe('C');
            expect(tree[0].children[0].children[0].score).toBe(30);
        });

        it('能够兼容处理非标准路径（父节点缺失）情况', () => {
            const stmt = helper.db.prepare('INSERT INTO user_mastery (user_id, tag_name, score) VALUES (1, ?, ?)');
            stmt.run('X/Y/Z', 100);

            const tree = masteryService.getMasteryTree(1);
            // 按照目前逻辑，父节点不存在时会作为根节点
            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('Z');
        });
    });
});
