// @vitest-environment node
import * as schema from '@/lib/db/drizzle-schema';
import { eq, and } from 'drizzle-orm';
import { setupVitestMemoryDb } from '@/lib/__tests__/db-mock-utils';

// 1. 设置数据库 Mock 持有者
const { actualSchema, mockDbHolder } = await vi.hoisted(async () => {
    const modSchema = await import('@/lib/db/drizzle-schema');
    return { 
        actualSchema: modSchema,
        mockDbHolder: { db: null as any }
    };
});

// 2. Mock 数据库模块，使用 Proxy 动态指向当前的内存数据库实例
vi.mock('@/lib/db', () => ({
    drizzleDb: new Proxy({}, {
        get: (_, prop) => {
            if (!mockDbHolder.db) {
                throw new Error('测试数据库尚未初始化，请确保在 beforeEach 中调用 setupVitestMemoryDb');
            }
            return mockDbHolder.db[prop];
        }
    }),
    drizzleSchema: actualSchema
}));

// 3. Mock 其他依赖
vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { 
    getSessionHistoryAction, 
    getSessionDetailAction, 
    deleteSessionAction, 
    getAvailableModesAction 
} from '../history';

describe('History Actions (In-Memory DB)', () => {
    let dbHelper: any;

    beforeEach(async () => {
        // 每个测试启动一个全新的内存数据库，确保环境隔离
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

    // ========== getSessionHistoryAction 测试 ==========
    describe('getSessionHistoryAction', () => {
        it('应该返回分页的会话历史', async () => {
            const db = dbHelper.db;
            
            // 真实插入数据
            await db.insert(schema.users).values({ id: 1, username: 'testuser', password_hash: 'hash' });
            await db.insert(schema.practice_sessions).values([
                { id: 'session-1', user_id: 1, session_name: 'S1', total_questions: 10, correct_count: 8, review_count: 2, created_at: '2026-01-17T00:00:00Z', practice_mode: 'normal' },
                { id: 'session-2', user_id: 1, session_name: 'S2', total_questions: 5, correct_count: 3, review_count: 1, created_at: '2026-01-16T00:00:00Z', practice_mode: 'normal' }
            ]);

            const result = await getSessionHistoryAction();

            expect(result.total).toBe(2);
            expect(result.items).toHaveLength(2);
            expect(result.items[0].accuracy).toBe(80);
        });
    });

    // ========== getSessionDetailAction 测试 ==========
    describe('getSessionDetailAction', () => {
        it('应该返回会话详情', async () => {
            const db = dbHelper.db;
            
            // 真实插入关联数据
            await db.insert(schema.users).values({ id: 1, username: 'testuser', password_hash: 'hash' });
            await db.insert(schema.questions).values({
                id: 101,
                content: '测试题目',
                options: '["A","B","C"]',
                answer: 'A',
                explanation: '解析内容',
                tags: '["心理学"]'
            });
            await db.insert(schema.practice_sessions).values({
                id: 'session-1', user_id: 1, total_questions: 5, correct_count: 4, review_count: 1, created_at: '2026-01-17'
            });
            await db.insert(schema.practice_logs).values({
                session_id: 'session-1',
                user_id: 1,
                question_id: 101,
                user_answer: 'A',
                is_correct: 1,
                duration_ms: 5000
            });

            const result = await getSessionDetailAction('session-1');

            expect(result).not.toBeNull();
            expect(result!.session.accuracy).toBe(80);
            expect(result!.logs).toHaveLength(1);
            expect(result!.logs[0].options).toEqual(['A', 'B', 'C']);
            expect(result!.logs[0].questionContent).toBe('测试题目');
        });
    });

    // ========== deleteSessionAction 测试 ==========
    describe('deleteSessionAction', () => {
        it('应该成功删除会话', async () => {
            const db = dbHelper.db;
            // 确保 userId 是数字，与 requireUser mock 一致
            await db.insert(schema.users).values({ id: 1, username: 'testuser', password_hash: 'hash' });
            await db.insert(schema.practice_sessions).values({ 
                id: 'session-1', 
                user_id: 1,
                practice_mode: 'normal' 
            });

            const result = await deleteSessionAction('session-1');

            expect(result.success).toBe(true);
            
            // 验证数据库中确实删除了
            const sessions = await db.select().from(schema.practice_sessions)
                .where(eq(schema.practice_sessions.id, 'session-1'))
                .all();
            expect(sessions).toHaveLength(0);
        });
    });

    // ========== getAvailableModesAction 测试 ==========
    describe('getAvailableModesAction', () => {
        it('应该返回可用的练习模式列表', async () => {
            const db = dbHelper.db;
            await db.insert(schema.users).values({ id: 1, username: 'testuser', password_hash: 'hash' });
            await db.insert(schema.practice_sessions).values([
                { id: 's1', user_id: 1, practice_mode: 'normal' },
                { id: 's2', user_id: 1, practice_mode: 'review' }
            ]);

            const result = await getAvailableModesAction();

            // 在真实数据库中，字段映射和 select 逻辑会自动生效
            expect(result).toContain('normal');
            expect(result).toContain('review');
        });
    });
});
