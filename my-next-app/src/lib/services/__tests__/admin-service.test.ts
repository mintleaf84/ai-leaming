// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Drizzle Mock（必须在 import service 之前） ----
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: Record<string, unknown> = {};
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select',
            'from', 'where', 'leftJoin', 'orderBy', 'limit', 'offset', 'all', 'get'];
        methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
        return chain;
    };

    const chain = makeChain();

    const mockDrizzleDb = {
        ...chain,
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        select: vi.fn(() => chain),
        transaction: vi.fn(),
    };

    const mockDrizzleSchema = {
        users: {
            id: 'id',
            username: 'username',
            role: 'role',
            created_at: 'created_at',
            token_version: 'token_version',
            password_hash: 'password_hash',
        },
        questions: {
            id: 'id',
            content: 'content',
            options: 'options',
            answer: 'answer',
            explanation: 'explanation',
            tags: 'tags',
            dimension: 'dimension',
            type: 'type',
        },
        practice_logs: { id: 'id' },
        ai_configs: { id: 'id', is_active: 'is_active' },
        user_subscriptions: {
            user_id: 'user_id',
            plan_id: 'plan_id',
            status: 'status',
            expires_at: 'expires_at',
        },
        subscription_plans: { id: 'id', name: 'name' },
    };

    return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock('@/lib/db', () => ({
    default: mockDrizzleDb,
    db: mockDrizzleDb,
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

// Mock 密码哈希，避免 bcrypt 计算
vi.mock('@/lib/auth/password', () => ({
    hashPassword: vi.fn().mockResolvedValue('hashed_password'),
}));

import { adminService } from '@/lib/services/admin-service';

// 获取链式调用末端 mock
const chain = mockDrizzleDb as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('AdminService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // 重置链式调用
        // chainMethods：需要在 beforeEach 中覆盖为返回 mockDrizzleDb 的中间链式方法
        // （不含终端方法 all/get，终端方法在各测试中按需单独设置）
        const chainMethods = ['values', 'set', 'from', 'where', 'leftJoin',
            'orderBy', 'limit', 'offset'];
        chainMethods.forEach((m) => { chain[m].mockReturnValue(mockDrizzleDb); });
        mockDrizzleDb.insert.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.update.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.delete.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.select.mockReturnValue(mockDrizzleDb);

        // 默认终止方法
        chain['all'].mockResolvedValue([]);
        chain['get'].mockResolvedValue(undefined);
    });

    // ────────────────────────────
    // getStats
    // ────────────────────────────
    describe('getStats', () => {
        it('应该返回各项统计数字', async () => {
            chain['get']
                .mockResolvedValueOnce({ count: 10 })  // users
                .mockResolvedValueOnce({ count: 200 }) // questions
                .mockResolvedValueOnce({ count: 500 }) // practice_logs
                .mockResolvedValueOnce({ count: 3 });  // ai_configs

            const stats = await adminService.getStats();

            expect(stats.users).toBe(10);
            expect(stats.questions).toBe(200);
            expect(stats.practices).toBe(500);
            expect(stats.activeAi).toBe(3);
        });

        it('查询失败时应返回全零统计', async () => {
            chain['get'].mockRejectedValue(new Error('DB 连接失败'));

            const stats = await adminService.getStats();

            expect(stats).toEqual({ users: 0, questions: 0, practices: 0, activeAi: 0 });
        });

        it('查询返回 undefined 时应返回 0', async () => {
            chain['get']
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined);

            const stats = await adminService.getStats();

            expect(stats).toEqual({ users: 0, questions: 0, practices: 0, activeAi: 0 });
        });
    });

    // ────────────────────────────
    // getUsers
    // ────────────────────────────
    describe('getUsers', () => {
        it('应该返回用户列表和总数', async () => {
            const mockItems = [
                { id: 1, username: 'admin', role: 'admin', created_at: '2024-01-01', token_version: 1, plan_id: 'pro', plan_name: '专业版', subscription_status: 'active', expires_at: null },
                { id: 2, username: 'user1', role: 'user', created_at: '2024-01-02', token_version: 1, plan_id: null, plan_name: null, subscription_status: null, expires_at: null },
            ];

            // getUsers 第一个查询的终端方法是 orderBy()
            chain['orderBy'].mockResolvedValueOnce(mockItems);
            // 第二个查询（count）的终端方法是 get()
            chain['get'].mockResolvedValueOnce({ count: 2 });

            const result = await adminService.getUsers();

            expect(result.total).toBe(2);
            expect(result.items).toHaveLength(2);
            // admin 应标记 is_admin
            expect(result.items[0].is_admin).toBe(true);
            expect(result.items[1].is_admin).toBe(false);
            // 无套餐用户应显示免费版
            expect(result.items[1].plan_name).toBe('免费版');
            expect(result.items[1].plan_id).toBe('free');
        });
    });

    // ────────────────────────────
    // getQuestions
    // ────────────────────────────
    describe('getQuestions', () => {
        it('应该解析 options 和 tags JSON 字段', async () => {
            const mockItems = [
                {
                    id: 1,
                    content: '测试题目',
                    options: '["A","B","C","D"]',
                    tags: '["数学","代数"]',
                    answer: 'A',
                    explanation: '解析',
                    dimension: 'knowledge',
                    type: 'single',
                },
            ];

            // getQuestions 第一个查询的终端方法是 orderBy()
            chain['orderBy'].mockResolvedValueOnce(mockItems);
            chain['get'].mockResolvedValueOnce({ count: 1 });

            const result = await adminService.getQuestions();

            expect(result.total).toBe(1);
            expect(result.items[0].options).toEqual(['A', 'B', 'C', 'D']);
            expect(result.items[0].tags).toEqual(['数学', '代数']);
        });

        it('已解析的 options 对象不应被二次解析', async () => {
            const mockItems = [
                {
                    id: 2,
                    content: '已解析题目',
                    options: ['A', 'B'],
                    tags: ['tag1'],
                    answer: 'B',
                    explanation: '',
                    dimension: 'knowledge',
                    type: 'single',
                },
            ];

            chain['orderBy'].mockResolvedValueOnce(mockItems);
            chain['get'].mockResolvedValueOnce({ count: 1 });

            const result = await adminService.getQuestions();

            expect(result.items[0].options).toEqual(['A', 'B']);
        });
    });

    // ────────────────────────────
    // deleteQuestion
    // ────────────────────────────
    describe('deleteQuestion', () => {
        it('应该删除题目并返回 true', async () => {
            const result = await adminService.deleteQuestion(1);
            expect(result).toBe(true);
            expect(mockDrizzleDb.delete).toHaveBeenCalled();
        });
    });

    // ────────────────────────────
    // batchDeleteQuestions
    // ────────────────────────────
    describe('batchDeleteQuestions', () => {
        it('空 ID 列表应直接返回 0', async () => {
            const result = await adminService.batchDeleteQuestions([]);
            expect(result).toBe(0);
            expect(mockDrizzleDb.delete).not.toHaveBeenCalled();
        });

        it('有 ID 时应执行删除', async () => {
            chain['where'].mockResolvedValueOnce({ rowsAffected: 3 });

            const result = await adminService.batchDeleteQuestions([1, 2, 3]);
            // rowsAffected 有值时应返回
            expect(result).toBeGreaterThanOrEqual(0);
            expect(mockDrizzleDb.delete).toHaveBeenCalled();
        });
    });

    // ────────────────────────────
    // getQuestionById
    // ────────────────────────────
    describe('getQuestionById', () => {
        it('找到时应解析 JSON 并返回题目', async () => {
            chain['get'].mockResolvedValueOnce({
                id: 5,
                content: '题目5',
                options: '["A","B"]',
                tags: '["tag"]',
                answer: 'A',
                explanation: 'X',
                dimension: 'knowledge',
                type: 'single',
            });

            const result = await adminService.getQuestionById(5);

            expect(result).not.toBeNull();
            expect(result!.options).toEqual(['A', 'B']);
        });

        it('未找到时应返回 null', async () => {
            chain['get'].mockResolvedValueOnce(undefined);
            const result = await adminService.getQuestionById(999);
            expect(result).toBeNull();
        });
    });

    // ────────────────────────────
    // updateQuestion
    // ────────────────────────────
    describe('updateQuestion', () => {
        it('应该更新题目并返回 true', async () => {
            const result = await adminService.updateQuestion(1, {
                content: '新内容',
                options: ['A', 'B'],
                tags: ['新标签'],
            });
            expect(result).toBe(true);
            expect(mockDrizzleDb.update).toHaveBeenCalled();
        });
    });

    // ────────────────────────────
    // resetPassword
    // ────────────────────────────
    describe('resetPassword', () => {
        it('应该重置密码并返回 true', async () => {
            const result = await adminService.resetPassword(2, 'new_password_123');
            expect(result).toBe(true);
            expect(mockDrizzleDb.update).toHaveBeenCalled();
        });
    });

    // ────────────────────────────
    // updateUserRole
    // ────────────────────────────
    describe('updateUserRole', () => {
        it('应该更新角色并返回 true', async () => {
            const result = await adminService.updateUserRole(2, 'admin');
            expect(result).toBe(true);
            expect(mockDrizzleDb.update).toHaveBeenCalled();
        });

        it('修改超级管理员（ID=1）应抛出错误', async () => {
            await expect(adminService.updateUserRole(1, 'student'))
                .rejects.toThrow('Cannot change super admin role');
        });
    });

    // ────────────────────────────
    // revokeUserSessions
    // ────────────────────────────
    describe('revokeUserSessions', () => {
        it('应该撤销会话并返回 true', async () => {
            const result = await adminService.revokeUserSessions(2);
            expect(result).toBe(true);
            expect(mockDrizzleDb.update).toHaveBeenCalled();
        });
    });

    // ────────────────────────────
    // deleteUser
    // ────────────────────────────
    describe('deleteUser', () => {
        it('应该删除用户并返回 true', async () => {
            const result = await adminService.deleteUser(2);
            expect(result).toBe(true);
            expect(mockDrizzleDb.delete).toHaveBeenCalled();
        });

        it('删除超级管理员（ID=1）应抛出错误', async () => {
            await expect(adminService.deleteUser(1))
                .rejects.toThrow('Cannot delete super admin');
        });
    });

    // ────────────────────────────
    // importQuestions
    // ────────────────────────────
    describe('importQuestions', () => {
        it('应该通过事务批量插入题目', async () => {
            const questions = [
                { content: 'Q1', options: ['A', 'B'], answer: 'A', explanation: 'E1', tags: ['t1'], dimension: 'knowledge', type: 'single' },
                { content: 'Q2', options: ['C', 'D'], answer: 'C', explanation: 'E2', tags: ['t2'], dimension: 'knowledge' },
            ];

            mockDrizzleDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
                const mockTx = {
                    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
                };
                return await cb(mockTx);
            });

            const count = await adminService.importQuestions(questions);
            expect(count).toBe(2);
            expect(mockDrizzleDb.transaction).toHaveBeenCalled();
        });
    });
});
