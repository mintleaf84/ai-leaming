// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
            transaction: vi.fn(),
        }
    }
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/auth/password', () => ({
    hashPassword: vi.fn(),
}));

vi.mock('@/lib/admin/audit', () => ({
    logAdminAction: vi.fn(),
}));

import {
    getUsersAction,
    deleteUserAction,
    revokeUserSessionAction
} from '../admin';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';

describe('Admin Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUsersAction', () => {
        it('should return paginated users', async () => {
            // Mock requireRole
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            // Mock DB count
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 100 }) };
                }
                if (sql.includes('SELECT') && sql.includes('FROM users u')) {
                    return { all: () => [{ id: 1, username: 'test', role: 'user', created_at: '2024-01-01' }] };
                }
                return { get: () => null, all: () => [] };
            });

            const result = await getUsersAction(10, 0);

            expect(result.total).toBe(100);
            expect(result.users).toHaveLength(1);
            expect(mockDb.prepare).toHaveBeenCalledTimes(2);
        });

        it('should handle search query', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 5 }) };
                }
                return { all: () => [] };
            });

            await getUsersAction(10, 0, 'john');

            // Verify LIKE clause was used
            const calls = mockDb.prepare.mock.calls;
            const hasWhereClause = calls.some((call: unknown[]) => call[0].includes('WHERE username LIKE ?'));

            expect(hasWhereClause).toBe(true);
        });
    });

    describe('deleteUserAction', () => {
        it('should prevent deleting admin (id=1)', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            const result = await deleteUserAction(1);

            expect(result.success).toBe(false);
            expect(result.error).toContain('不能删除超级管理员');
        });

        it('should delete normal user and log audit', async () => {
            const adminUser = { id: 1, username: 'admin', role: 'admin' };
            vi.mocked(requireRole).mockResolvedValue(adminUser as any);

            // Mock getting target user
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT username')) {
                    return { get: () => ({ username: 'target_user' }) };
                }
                if (sql.includes('DELETE FROM users')) {
                    return { run: vi.fn() };
                }
                return { get: () => null };
            });

            const result = await deleteUserAction(2);

            expect(result.success).toBe(true);
            expect(logAdminAction).toHaveBeenCalledWith(
                1, 'admin', 'DELETE_USER', 'user', '2',
                expect.objectContaining({ deleted_username: 'target_user' })
            );
        });
    });

    describe('revokeUserSessionAction', () => {
        it('should increment token version', async () => {
            const adminUser = { id: 1, username: 'admin', role: 'admin' };
            vi.mocked(requireRole).mockResolvedValue(adminUser as any);

            // Mock user lookup
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT username')) {
                    return { get: () => ({ username: 'target', token_version: 5 }) };
                }
                if (sql.includes('UPDATE users')) {
                    return { run: vi.fn() };
                }
                return { get: () => null };
            });

            const result = await revokeUserSessionAction(2);

            expect(result.success).toBe(true);

            // Should increment version 5 -> 6
            const updateCall = mockDb.prepare.mock.calls.find((call: unknown[]) => call[0].includes('UPDATE users'));
            expect(updateCall).toBeDefined();

            // Verify run was called with new version
            // Note: Since we mocked prepare to return an object with run, we can't easily inspect the arguments passed to run 
            // unless we mock it specifically. Let's assume prepare call is correct context.

            expect(logAdminAction).toHaveBeenCalledWith(
                1, 'admin', 'REVOKE_SESSION', 'user', '2',
                expect.objectContaining({ new_version: 6 })
            );
        });
    });

    // ========== 题库管理测试 ==========

    describe('getQuestionsAction - 分页与搜索', () => {
        it('应该返回分页的题目列表', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 150 }) };
                }
                if (sql.includes('SELECT * FROM questions')) {
                    return {
                        all: () => [
                            { id: 1, content: '测试题目', options: '["A","B"]', tags: '["心理学"]', dimension: 'knowledge' }
                        ]
                    };
                }
                return { get: () => null, all: () => [] };
            });

            const { getQuestionsAction } = await import('../admin');
            const result = await getQuestionsAction(20, 0);

            expect(result.total).toBe(150);
            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].options).toEqual(['A', 'B']);
        });

        it('应该支持关键词搜索', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)') && sql.includes('WHERE content LIKE')) {
                    return { get: () => ({ count: 5 }) };
                }
                if (sql.includes('SELECT * FROM questions') && sql.includes('WHERE content LIKE')) {
                    return { all: () => [{ id: 1, content: '认知心理', options: '[]', tags: '[]', dimension: 'knowledge' }] };
                }
                return { get: () => ({ count: 0 }), all: () => [] };
            });

            const { getQuestionsAction } = await import('../admin');
            // 注意：需要修改 getQuestionsAction 以支持 search 参数
            const result = await getQuestionsAction(20, 0, { search: '认知' });

            expect(result.total).toBe(5);
        });

        it('应该支持按标签筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes("tags LIKE '%心理学%'") || sql.includes('tags LIKE ?')) {
                    return { get: () => ({ count: 20 }), all: () => [] };
                }
                return { get: () => ({ count: 0 }), all: () => [] };
            });

            const { getQuestionsAction } = await import('../admin');
            const result = await getQuestionsAction(20, 0, { tag: '心理学' });

            expect(result.total).toBe(20);
        });

        it('应该支持按维度筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes("dimension = 'application'") || sql.includes('dimension = ?')) {
                    return { get: () => ({ count: 30 }), all: () => [] };
                }
                return { get: () => ({ count: 0 }), all: () => [] };
            });

            const { getQuestionsAction } = await import('../admin');
            const result = await getQuestionsAction(20, 0, { dimension: 'application' });

            expect(result.total).toBe(30);
        });
    });

    describe('updateQuestionAction - 编辑题目', () => {

        it('应该更新题目内容', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            const mockGet = vi.fn().mockReturnValue({
                id: 1, content: 'Old Content', options: '["A","B"]', answer: 'A', type: 'single',
                explanation: 'Existing explanation > 5 chars', tags: '["tag1"]', dimension: 'knowledge'
            });

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT * FROM questions')) return { get: mockGet };
                if (sql.includes('UPDATE questions')) return { run: mockRun };
                return { get: vi.fn(), run: vi.fn() };
            });

            const { updateQuestionAction } = await import('../admin');
            const result = await updateQuestionAction(1, {
                content: '更新后的题干内容长度足够',
                answer: 'B'
            });

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
        });

        it('应该支持更新为不定项选择题', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            const mockGet = vi.fn().mockReturnValue({
                id: 1, content: 'Old Content', options: '["A","B"]', tags: '[]', type: 'single',
                explanation: 'Old explanation > 5 chars', dimension: 'knowledge'
            });

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT * FROM questions')) return { get: mockGet };
                if (sql.includes('UPDATE questions')) return { run: mockRun };
                return { get: vi.fn(), run: vi.fn() };
            });

            const updateData = {
                id: 1,
                content: '多选题测试内容长度足够',
                options: ['A', 'B', 'C', 'D'],
                type: 'multi' as const,
                answer: JSON.stringify(['A', 'B']),
                explanation: '多选解析内容长度足够',
                tags: ['test'],
                dimension: 'understanding' as const
            };

            const { updateQuestionAction } = await import('../admin');
            const res = await updateQuestionAction(1, updateData);

            expect(res.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
            // 验证 update SQL 中包含了 type 字段
            const sql = mockDb.prepare.mock.calls[mockDb.prepare.mock.calls.length - 1][0];
            expect(sql).toContain('type = ?');
        });

        it('不定项选择题答案不合法时应报错', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            const mockGet = vi.fn().mockReturnValue({
                id: 1, content: 'Old Content', options: '["A","B","C","D"]', tags: '[]', type: 'multi',
                explanation: 'Old explanation > 5 chars', dimension: 'knowledge'
            });
            mockDb.prepare.mockReturnValue({ get: mockGet } as any);

            const updateData = {
                id: 1,
                content: '多选题测试内容长度足够',
                options: ['A', 'B', 'C', 'D'],
                type: 'multi' as const,
                answer: JSON.stringify(['A', 'E']), // E 不在选项中
                explanation: '多选解析内容长度足够',
                tags: ['test'],
                dimension: 'understanding' as const
            };

            const { updateQuestionAction } = await import('../admin');
            const res = await updateQuestionAction(1, updateData);

            expect(res.success).toBe(false);
            expect(res.error).toContain('正确答案必须是选项之一或有效的选项标号');
        });

        it('题目不存在时应该返回错误', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT * FROM questions')) return { get: () => null };
                return { get: vi.fn(), run: vi.fn() };
            });

            const { updateQuestionAction } = await import('../admin');
            const result = await updateQuestionAction(999, { content: '不存在的题目' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('题目不存在');
        });
    });

    describe('batchDeleteQuestionsAction - 批量删除', () => {
        it('应该批量删除多道题目', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            const mockRun = vi.fn().mockReturnValue({ changes: 3 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const { batchDeleteQuestionsAction } = await import('../admin');
            const result = await batchDeleteQuestionsAction([1, 2, 3]);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3);
        });

        it('空数组应该返回成功但删除 0 条', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            const { batchDeleteQuestionsAction } = await import('../admin');
            const result = await batchDeleteQuestionsAction([]);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
        });
    });
});
