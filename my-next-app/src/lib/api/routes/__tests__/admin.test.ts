// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from '@/lib/__tests__/test-db-utils';
import * as schema from '@/lib/db/drizzle-schema';

// 1. 设置 Mock
let testDbHelper: TestDbHelper;

vi.mock('@/lib/db', () => ({
    get drizzleDb() { return testDbHelper.db; },
    get drizzleSchema() { return schema; }
}));

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => {
    return {
        mockRequireRole: vi.fn().mockResolvedValue({ id: 1, role: 'admin', username: 'admin_user' }),
        mockLogAdminAction: vi.fn()
    };
});

vi.mock('@/lib/auth/auth', () => ({ requireRole: mockRequireRole }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: mockLogAdminAction }));
vi.mock('@/lib/admin/api-stats-service', () => ({ getApiCallStats: vi.fn().mockReturnValue({ total: 100 }) }));

// 导入路由
import { adminRoute as app } from '../admin';

describe('Admin Hono Routes (Integration)', () => {
    beforeEach(async () => {
        testDbHelper = await setupTestDb();
        // 预置系统用户 (ID=0) 用于 settings
        await testDbHelper.db.insert(schema.users).values({
            id: 0,
            username: 'system_global_user',
            password_hash: 'none',
            role: 'admin'
        });
        // 预置普通管理员用户 (ID=1)
        await testDbHelper.db.insert(schema.users).values({
            id: 1,
            username: 'admin_user',
            password_hash: 'none',
            role: 'admin'
        });
    });

    afterEach(async () => {
        await testDbHelper.close();
    });

    describe('GET /system', () => {
        it('should return system status with stats', async () => {
            await testDbHelper.db.insert(schema.system_settings).values({
                user_id: 0,
                key: 'demo_mode_enabled',
                value: 'true'
            });
            
            const res = await app.request('/system');
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.demoMode).toBe(true);
            expect(data.ai.total).toBe(100);
        });
    });

    describe('POST /system', () => {
        it('should toggle demo mode', async () => {
            // 初始值为 false
            await testDbHelper.db.insert(schema.system_settings).values({
                user_id: 0,
                key: 'demo_mode_enabled',
                value: 'false'
            });

            const res = await app.request('/system', {
                method: 'POST',
                body: JSON.stringify({ action: 'toggle_demo_mode' }),
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.demoMode).toBe(true);

            // 验证数据库
            const row = await testDbHelper.db.query.system_settings.findFirst({
                where: (f: any, { eq, and }: any) => and(eq(f.user_id, 0), eq(f.key, 'demo_mode_enabled'))
            });
            expect(row?.value).toBe('true');
        });
    });

    describe('GET /export/questions', () => {
        it('should return CSV on success', async () => {
            await testDbHelper.db.insert(schema.questions).values({
                content: 'Q1',
                answer: 'A',
                options: '["A", "B"]',
                tags: '["tag1"]'
            });

            const res = await app.request('/export/questions');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toContain('text/csv');
            expect(await res.text()).toContain('Q1');
        });
    });
});
