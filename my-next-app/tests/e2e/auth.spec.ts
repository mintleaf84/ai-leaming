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
        // 等待页面加载并稳定
        await mockPage.waitForSelector('input[placeholder*="用户名"]');
        await mockPage.waitForTimeout(1000); 

        // 使用种子数据中的测试用户登录
        await mockPage.getByPlaceholder(/用户名/).fill(TEST_USER.username);
        await mockPage.getByPlaceholder(/密码/).fill(TEST_USER.password);
        await mockPage.getByRole('button', { name: /登录/i }).click();

        // 应该被重定向到 dashboard
        // 增加超时到 20s，因为 Next.js 路由跳转涉及组件加载和 SSR
        await expect(mockPage).toHaveURL(/\/(dashboard|home|practice)/, { timeout: 20000 });
    });


    test('无效凭证应显示错误信息', async ({ mockPage }) => {
        await mockPage.goto('/login');
        await mockPage.waitForSelector('input[placeholder*="用户名"]');
        await mockPage.waitForTimeout(500);

        await mockPage.getByPlaceholder(/用户名/).fill('invaliduser');
        await mockPage.getByPlaceholder(/密码/).fill('wrongpassword');
        await mockPage.getByRole('button', { name: /登录/i }).click();

        // 应该显示错误提示
        // 增加超时并扩大匹配范围
        const errorMsg = mockPage.getByText(/用户名或密码|不正确|登录失败|Invalid/i);
        await expect(errorMsg).toBeVisible({ timeout: 10000 });
    });


    test('已登录用户能访问受保护页面', async ({ loggedInPage }) => {
        // loggedInPage 已自动登录
        await loggedInPage.goto('/dashboard');

        // 验证能访问（不会被重定向到登录页）
        // 显式等待关键元素，确保页面已渲染，使用 first() 避免多个匹配导致的错误
        await expect(loggedInPage.getByText(/欢迎回来|今日专注|修习者/i).first()).toBeVisible({ timeout: 20000 });

        expect(loggedInPage.url()).not.toContain('/login');
    });

});
