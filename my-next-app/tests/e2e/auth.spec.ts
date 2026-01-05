import { test, expect, TEST_USER } from './fixtures';

/**
 * 认证流程 E2E 测试
 * 覆盖登录、注册、登出等核心功能
 */
test.describe('认证流程', () => {
    test('应该展示登录页面', async ({ mockPage }) => {
        await mockPage.goto('/login');

        // 验证标题和表单元素存在
        await expect(mockPage.getByPlaceholder(/用户名/)).toBeVisible({ timeout: 10000 });
        await expect(mockPage.getByPlaceholder(/密码/)).toBeVisible();
        await expect(mockPage.getByRole('button', { name: /登录/i })).toBeVisible();
    });

    test('测试用户能够成功登录', async ({ mockPage }) => {
        await mockPage.goto('/login');

        // 使用种子数据中的测试用户登录
        await mockPage.getByPlaceholder(/用户名/).fill(TEST_USER.username);
        await mockPage.getByPlaceholder(/密码/).fill(TEST_USER.password);
        await mockPage.getByRole('button', { name: /登录/i }).click();

        // 应该被重定向到 dashboard
        await expect(mockPage).toHaveURL(/\/(dashboard|home|practice)/, { timeout: 10000 });
    });

    test('无效凭证应显示错误信息', async ({ mockPage }) => {
        await mockPage.goto('/login');

        await mockPage.getByPlaceholder(/用户名/).fill('invaliduser');
        await mockPage.getByPlaceholder(/密码/).fill('wrongpassword');
        await mockPage.getByRole('button', { name: /登录/i }).click();

        // 应该显示错误提示
        await expect(mockPage.getByText(/用户名或密码|登录失败|不正确/)).toBeVisible({ timeout: 5000 });
    });

    test('已登录用户能访问受保护页面', async ({ loggedInPage }) => {
        // loggedInPage 已自动登录
        await loggedInPage.goto('/dashboard');

        // 验证能访问（不会被重定向到登录页）
        await loggedInPage.waitForTimeout(1000);
        expect(loggedInPage.url()).not.toContain('/login');
    });
});
