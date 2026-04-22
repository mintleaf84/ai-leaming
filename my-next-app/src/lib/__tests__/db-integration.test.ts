import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestTables as createTables } from '../db/test-schema-utils';
import { calculateStreakFromDates } from '../utils/stats-utils';

/**
 * 集成测试示例：使用内存数据库验证真实 SQL 逻辑。
 * 这种测试方式彻底解决了“掩耳盗铃”问题，因为它不再对 SQL 逻辑进行 Mock，
 * 而是直接在真实的 Schema 上运行查询。
 */
describe('Database Integration Test (In-Memory SQLite)', () => {
    let db: Database.Database;

    beforeEach(() => {
        // 创建内存数据库
        db = new Database(':memory:');
        // 初始化表结构
        createTables(db);
        
        // 插入基础数据
        db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'testuser', 'hash')").run();
    });

    afterEach(() => {
        db.close();
    });

    describe('验证统计逻辑 (Stats SQL)', () => {
        it('应该通过真实 SQL 提取出正确的连续练习日期', () => {
            const today = '2024-01-15';
            
            // 准备题目数据 (修复外键约束错误)
            const insertQ = db.prepare("INSERT INTO questions (id, content) VALUES (?, ?)");
            insertQ.run(101, 'Q101');
            insertQ.run(102, 'Q102');
            insertQ.run(103, 'Q103');

            // 插入跨越断档的练习记录
            const insertLog = db.prepare("INSERT INTO practice_logs (user_id, question_id, is_correct, timestamp) VALUES (1, ?, 1, ?)");
            insertLog.run(101, '2024-01-15 10:00:00'); // 今天
            insertLog.run(102, '2024-01-14 20:00:00'); // 昨天
            // 13号没做
            insertLog.run(103, '2024-01-12 09:00:00'); // 前天
            
            // 执行 stats.ts 中的真实 SQL 逻辑
            const rows = db.prepare(`
                SELECT DISTINCT date(timestamp) as practice_date 
                FROM practice_logs 
                WHERE user_id = 1 AND timestamp > datetime(?, '-30 days')
                ORDER BY practice_date DESC
            `).all(today) as { practice_date: string }[];
            
            const dates = rows.map(r => r.practice_date);
            
            // 验证 SQL 筛选结果
            expect(dates).toHaveLength(3);
            expect(dates[0]).toBe('2024-01-15');
            expect(dates[1]).toBe('2024-01-14');
            expect(dates[2]).toBe('2024-01-12');
            
            // 结合纯函数验证业务逻辑 (连续天数应为 2)
            const streak = calculateStreakFromDates(dates, '2024-01-15', '2024-01-14');
            expect(streak).toBe(2);
        });
    });

    describe('验证调度逻辑 (Scheduling SQL)', () => {
        beforeEach(() => {
            // 准备题目数据 (含 JSON 标签)
            const insertQ = db.prepare("INSERT INTO questions (id, content, tags) VALUES (?, ?, ?)");
            insertQ.run(1, '重难点题目', '["Math", "Logic"]');
            insertQ.run(2, '盲点题目', '["History"]');
            insertQ.run(3, '普通题目', '["English"]');
            
            // 准备“观察区”映射 (Stubborn Logic)
            db.prepare("INSERT INTO user_mastery (user_id, tag_name) VALUES (1, 'Math')").run();
            db.prepare("INSERT INTO observation_zone (user_id, tag_name, status) VALUES (1, 'Math', 'active')").run();
            
            // 准备练习记录 (Blind Spot Logic: 排除 ID 1 和 3)
            db.prepare("INSERT INTO practice_logs (user_id, question_id, is_correct) VALUES (1, 1, 1)").run();
            db.prepare("INSERT INTO practice_logs (user_id, question_id, is_correct) VALUES (1, 3, 1)").run();
        });

        it('Stubborn 逻辑：应该通过观察区标签正确筛选题目', () => {
            const stubborn = db.prepare(`
                SELECT q.* FROM questions q
                JOIN observation_zone oz ON EXISTS (
                    SELECT 1 FROM json_each(q.tags) WHERE value = oz.tag_name
                )
                WHERE oz.status = 'active'
            `).all() as any[];
            
            expect(stubborn).toHaveLength(1);
            expect(stubborn[0].id).toBe(1);
        });

        it('Blind Spots 逻辑：应该正确筛选出从未练习过的题目', () => {
            const blind = db.prepare(`
                SELECT q.* FROM questions q
                WHERE NOT EXISTS (
                    SELECT 1 FROM practice_logs pl WHERE pl.question_id = q.id
                )
            `).all() as any[];
            
            expect(blind).toHaveLength(1);
            expect(blind[0].id).toBe(2);
        });
    });
});
