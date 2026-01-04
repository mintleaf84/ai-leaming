import { test, expect } from '@playwright/test';

/**
 * 认证流程 E2E 测试
 * 覆盖登录、注册、登出等核心功能
 */
test.describe('认证流程', () => {
    test('应该展示登录页面', async ({ page }) => {
        await page.goto('/login');

        // 验证标题和表单元素存在
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /登录/i })).toBeVisible();
    });

    test('未登录用户应被重定向到登录页', async ({ page }) => {
        // 尝试访问受保护的路由
        await page.goto('/dashboard');

        // 应该被重定向到登录页
        await expect(page).toHaveURL(/\/login/);
    });

    test('无效凭证应显示错误信息', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[name="username"]', 'invaliduser');
        await page.fill('input[name="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');

        // 应该显示错误提示
        await expect(page.locator('text=用户名或密码不正确')).toBeVisible({ timeout: 5000 });
    });

    test('注册页面应正常显示', async ({ page }) => {
        await page.goto('/register');

        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /注册/i })).toBeVisible();
    });
});
