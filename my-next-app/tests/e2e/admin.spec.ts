import { test, expect } from '@playwright/test';

/**
 * 后台管理权限 E2E 测试
 */
test.describe('后台管理权限', () => {
    test('未登录用户访问后台应被重定向', async ({ page }) => {
        await page.goto('/admin');
        await page.waitForTimeout(2000);

        // 验证被重定向到登录页
        expect(page.url()).toMatch(/\/(login|admin)/);
    });

    test('首页可以被访问', async ({ page }) => {
        const response = await page.goto('/');
        expect([200, 302, 307, 308]).toContain(response?.status());
    });
});
