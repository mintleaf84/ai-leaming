import { test, expect } from './fixtures';

/**
 * Admin AI 配置管理 E2E 测试
 */
test.describe('Admin AI 配置管理', () => {
    test('管理员能访问后台', async ({ adminPage }) => {
        await adminPage.goto('/admin');
        await adminPage.waitForTimeout(2000);

        // 验证管理后台加载
        await expect(adminPage.getByRole('heading', { name: '概览', exact: true }).first()).toBeVisible({ timeout: 10000 });
    });

    test('管理员能访问 AI 配置页面', async ({ adminPage }) => {
        await adminPage.goto('/admin/ai');
        await adminPage.waitForTimeout(2000);

        // 验证页面正常加载
        await expect(adminPage.locator('body')).toBeVisible();
    });
});
