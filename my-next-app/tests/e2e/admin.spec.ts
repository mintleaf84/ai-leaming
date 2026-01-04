import { test, expect } from '@playwright/test';

/**
 * 后台管理权限 E2E 测试
 * 验证只有管理员可以访问后台
 */
test.describe('后台管理权限', () => {
    test('未登录用户不能访问后台', async ({ page }) => {
        await page.goto('/admin');

        // 应该被重定向到登录页
        await expect(page).toHaveURL(/\/login/);
    });

    test('首页可以被任何人访问', async ({ page }) => {
        const response = await page.goto('/');

        // 200 正常或 302 重定向都可接受
        expect([200, 302]).toContain(response?.status());
    });
});
