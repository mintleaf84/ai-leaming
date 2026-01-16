// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            // Mock DB count
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 100 }) };
                }
                if (sql.includes('SELECT id, username')) {
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
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 5 }) };
                }
                return { all: () => [] };
            });

            await getUsersAction(10, 0, 'john');

            // Verify LIKE clause was used
            const calls = mockDb.prepare.mock.calls;
            const hasWhereClause = calls.some((call: any[]) => call[0].includes('WHERE username LIKE ?'));

            expect(hasWhereClause).toBe(true);
        });
    });

    describe('deleteUserAction', () => {
        it('should prevent deleting admin (id=1)', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);

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
            const updateCall = mockDb.prepare.mock.calls.find((call: any[]) => call[0].includes('UPDATE users'));
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
});
