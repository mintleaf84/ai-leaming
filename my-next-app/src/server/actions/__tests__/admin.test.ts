// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
vi.mock('@/lib/services/admin-service', () => ({
    adminService: {
        getUsers: vi.fn(),
        deleteUser: vi.fn(),
        revokeUserSessions: vi.fn(),
        getQuestions: vi.fn(),
        getQuestionById: vi.fn(),
        updateQuestion: vi.fn(),
        batchDeleteQuestions: vi.fn(),
        getStats: vi.fn(),
    }
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
    revokeUserSessionAction,
    getQuestionsAction,
    updateQuestionAction,
    batchDeleteQuestionsAction
} from '../admin';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { adminService } from '@/lib/services/admin-service';

describe('Admin Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUsersAction', () => {
        it('should return paginated users', async () => {
            // Mock requireRole
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            // Mock adminService.getUsers
            vi.mocked(adminService.getUsers).mockResolvedValue({
                items: [{ id: 1, username: 'test', role: 'user', created_at: '2024-01-01', is_admin: false, plan_id: 'free', plan_name: '免费版' }] as any,
                total: 100
            });

            const result = await getUsersAction(10, 0);

            expect(result.total).toBe(100);
            expect(result.users).toHaveLength(1);
            expect(adminService.getUsers).toHaveBeenCalledWith(10, 0, '');
        });

        it('should handle search query', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.getUsers).mockResolvedValue({ items: [], total: 5 });

            await getUsersAction(10, 0, 'john');

            expect(adminService.getUsers).toHaveBeenCalledWith(10, 0, 'john');
        });
    });

    describe('deleteUserAction', () => {
        it('should prevent deleting admin (id=1)', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.deleteUser).mockRejectedValue(new Error('Cannot delete super admin'));

            const result = await deleteUserAction(1);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot delete super admin');
        });

        it('should delete normal user and log audit', async () => {
            const adminUser = { id: 1, username: 'admin', role: 'admin' };
            vi.mocked(requireRole).mockResolvedValue(adminUser as any);
            vi.mocked(adminService.deleteUser).mockResolvedValue(true);

            const result = await deleteUserAction(2);

            expect(result.success).toBe(true);
            expect(logAdminAction).toHaveBeenCalledWith(
                1, 'admin', 'DELETE_USER', 'user', '2'
            );
        });
    });

    describe('revokeUserSessionAction', () => {
        it('should increment token version', async () => {
            const adminUser = { id: 1, username: 'admin', role: 'admin' };
            vi.mocked(requireRole).mockResolvedValue(adminUser as any);
            vi.mocked(adminService.revokeUserSessions).mockResolvedValue(true);

            const result = await revokeUserSessionAction(2);

            expect(result.success).toBe(true);
            expect(adminService.revokeUserSessions).toHaveBeenCalledWith(2);
            expect(logAdminAction).toHaveBeenCalledWith(
                1, 'admin', 'REVOKE_SESSION', 'user', '2'
            );
        });
    });

    // ========== 题库管理测试 ==========

    describe('getQuestionsAction - 分页与搜索', () => {
        it('应该返回分页的题目列表', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.getQuestions).mockResolvedValue({
                items: [{ id: 1, content: '测试题目', options: ['A', 'B'], tags: ['心理学'], dimension: 'knowledge' }] as any,
                total: 150
            });

            const result = await getQuestionsAction(20, 0);

            expect(result.total).toBe(150);
            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].options).toEqual(['A', 'B']);
        });

        it('应该支持关键词搜索', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.getQuestions).mockResolvedValue({ items: [], total: 5 });

            const result = await getQuestionsAction(20, 0, { search: '认知' });

            expect(result.total).toBe(5);
            expect(adminService.getQuestions).toHaveBeenCalledWith(20, 0, { search: '认知' });
        });

        it('应该支持按标签筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.getQuestions).mockResolvedValue({ items: [], total: 20 });

            const result = await getQuestionsAction(20, 0, { tag: '心理学' });

            expect(result.total).toBe(20);
            expect(adminService.getQuestions).toHaveBeenCalledWith(20, 0, { tag: '心理学' });
        });

        it('应该支持按维度筛选', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);
            vi.mocked(adminService.getQuestions).mockResolvedValue({ items: [], total: 30 });

            const result = await getQuestionsAction(20, 0, { dimension: 'application' });

            expect(result.total).toBe(30);
            expect(adminService.getQuestions).toHaveBeenCalledWith(20, 0, { dimension: 'application' });
        });
    });

    describe('updateQuestionAction - 编辑题目', () => {

        it('应该更新题目内容', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            vi.mocked(adminService.getQuestionById).mockResolvedValue({
                id: 1, content: 'Old Content', options: ['A', 'B'], answer: 'A', type: 'single',
                explanation: 'Existing explanation > 5 chars', tags: ['tag1'], dimension: 'knowledge'
            } as any);
            vi.mocked(adminService.updateQuestion).mockResolvedValue(true);

            const result = await updateQuestionAction(1, {
                content: '更新后的题干内容长度足够',
                answer: 'B'
            });

            expect(result.success).toBe(true);
            expect(adminService.updateQuestion).toHaveBeenCalled();
        });

        it('应该支持更新为不定项选择题', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            vi.mocked(adminService.getQuestionById).mockResolvedValue({
                id: 1, content: 'Old Content', options: ['A', 'B'], tags: [], type: 'single',
                explanation: 'Old explanation > 5 chars', dimension: 'knowledge'
            } as any);
            vi.mocked(adminService.updateQuestion).mockResolvedValue(true);

            const updateData = {
                content: '多选题测试内容长度足够',
                options: ['A', 'B', 'C', 'D'],
                type: 'multi' as const,
                answer: JSON.stringify(['A', 'B']),
                explanation: '多选解析内容长度足够',
                tags: ['test'],
                dimension: 'understanding' as const
            };

            const res = await updateQuestionAction(1, updateData);

            expect(res.success).toBe(true);
            expect(adminService.updateQuestion).toHaveBeenCalledWith(1, updateData);
        });

        it('不定项选择题答案不合法时应报错', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin', username: 'admin' } as any);

            vi.mocked(adminService.getQuestionById).mockResolvedValue({
                id: 1, content: 'Old Content', options: ['A', 'B', 'C', 'D'], tags: ['test'], type: 'multi',
                explanation: 'Old explanation > 5 chars', dimension: 'knowledge'
            } as any);

            const updateData = {
                options: ['A', 'B', 'C', 'D'],
                type: 'multi' as const,
                answer: JSON.stringify(['A', 'E']), // E 不在选项中
                tags: ['test']
            };

            const res = await updateQuestionAction(1, updateData);

            expect(res.success).toBe(false);
            expect(res.error).toContain('正确答案必须是选项之一或有效的选项标号');
        });

        it('题目不存在时应该返回错误', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);
            vi.mocked(adminService.getQuestionById).mockResolvedValue(null);

            const result = await updateQuestionAction(999, { content: '不存在的题目' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('题目不存在');
        });
    });

    describe('batchDeleteQuestionsAction - 批量删除', () => {
        it('应该批量删除多道题目', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);
            vi.mocked(adminService.batchDeleteQuestions).mockResolvedValue(3);

            const result = await batchDeleteQuestionsAction([1, 2, 3]);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3);
        });

        it('空数组应该返回成功但删除 0 条', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, username: 'admin', role: 'admin' } as any);

            const result = await batchDeleteQuestionsAction([]);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
        });
    });
});
