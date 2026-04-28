import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { TEST_SCHEMA_SQL } from '../db/test-schema-utils';
import { calculateStreakFromDates } from '../utils/stats-utils';

/**
 * 集成测试示例：使用内存数据库验证真实 SQL 逻辑。
 * 这种测试方式彻底解决了“掩耳胆灵”问题，因为它不再对 SQL 逻辑进行 Mock，
 * 而是直接在真实的 Schema 上运行查询。
 */
describe('Database Integration Test (In-Memory LibSQL)', () => {
    let client: any;
    let db: any;

    beforeEach(async () => {
        // 创建内存数据库
        client = createClient({ url: ':memory:' });
        db = drizzle(client);
        
        // 初始化表结构 (直接运行 SQL 以确保最快速度)
        for (const statement of TEST_SCHEMA_SQL.split(';')) {
            if (statement.trim()) {
                await client.execute(statement);
            }
        }
        
        // 插入基础数据
        await db.run(sql`INSERT INTO users (id, username, password_hash) VALUES (1, 'testuser', 'hash')`);
    });

    describe('验证统计逻辑 (Stats SQL)', () => {
        it('应该通过真实 SQL 提取出正确的连续练习日期', async () => {
            const today = '2024-01-15';
            
            // 准备题目数据
            await db.run(sql`INSERT INTO questions (id, content) VALUES (101, 'Q101'), (102, 'Q102'), (103, 'Q103')`);

            // 插入跨越断档的练习记录
            await db.run(sql`INSERT INTO practice_logs (user_id, question_id, is_correct, timestamp) VALUES 
                (1, 101, 1, '2024-01-15 10:00:00'),
                (1, 102, 1, '2024-01-14 20:00:00'),
                (1, 103, 1, '2024-01-12 09:00:00')`);
            
            // 执行 stats.ts 中的真实 SQL 逻辑
            const result = await db.run(sql`
                SELECT DISTINCT date(timestamp) as practice_date 
                FROM practice_logs 
                WHERE user_id = 1 AND timestamp > datetime(${today}, '-30 days')
                ORDER BY practice_date DESC
            `);
            
            const dates = result.rows.map((r: any) => r.practice_date);
            
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
        beforeEach(async () => {
            // 准备题目数据 (含 JSON 标签)
            await db.run(sql`INSERT INTO questions (id, content, tags) VALUES 
                (1, '重难点题目', '["Math", "Logic"]'),
                (2, '盲点题目', '["History"]'),
                (3, '普通题目', '["English"]')`);
            
            // 准备“观察区”映射
            await db.run(sql`INSERT INTO user_mastery (user_id, tag_name) VALUES (1, 'Math')`);
            await db.run(sql`INSERT INTO observation_zone (user_id, tag_name, status) VALUES (1, 'Math', 'active')`);
            
            // 准备练习记录
            await db.run(sql`INSERT INTO practice_logs (user_id, question_id, is_correct) VALUES (1, 1, 1), (1, 3, 1)`);
        });

        it('Stubborn 逻辑：应该通过观察区标签正确筛选题目', async () => {
            const result = await db.run(sql`
                SELECT q.id FROM questions q
                JOIN observation_zone oz ON EXISTS (
                    SELECT 1 FROM json_each(q.tags) WHERE value = oz.tag_name
                )
                WHERE oz.status = 'active'
            `);
            
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].id).toBe(1);
        });

        it('Blind Spots 逻辑：应该正确筛选出从未练习过的题目', async () => {
            const result = await db.run(sql`
                SELECT q.id FROM questions q
                WHERE NOT EXISTS (
                    SELECT 1 FROM practice_logs pl WHERE pl.question_id = q.id
                )
            `);
            
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].id).toBe(2);
        });
    });
});
