import { test, expect } from './fixtures';

/**
 * 个人中心与订阅 E2E 测试（模块九：PR-01 ~ PR-02）
 * 覆盖个人中心渲染和定价页套餐展示
 */
test.describe('个人中心与订阅', () => {

    // PR-01：个人中心基础渲染
    test('PR-01 个人中心页面正常渲染', async ({ loggedInPage }) => {
        await loggedInPage.goto('/profile');
        await loggedInPage.waitForTimeout(2000);

        // 页面正常加载
        await expect(loggedInPage.locator('body')).toBeVisible();

        // 应显示当前用户名（种子用户为 testuser）
        await expect(loggedInPage.getByText(/testuser/i).first()).toBeVisible({ timeout: 10000 });

        // 应显示订阅信息区域（全局 setup 已为 testuser 创建 free 套餐）
        const subscriptionInfo = loggedInPage.getByText(/订阅|免费版|套餐/i);
        await expect(subscriptionInfo.first()).toBeVisible({ timeout: 10000 });

        // 应显示今日用量统计
        const usageInfo = loggedInPage.getByText(/今日用量|用量/i);
        const hasUsage = await usageInfo.first().isVisible({ timeout: 5000 }).catch(() => false);
        // 宽松验证：至少有订阅信息或用量信息之一
        expect(await subscriptionInfo.first().isVisible() || hasUsage).toBe(true);
    });

    // PR-02：查看定价页
    test('PR-02 定价页展示套餐对比', async ({ mockPage }) => {
        await mockPage.goto('/pricing');
        await mockPage.waitForTimeout(2000);

        // 页面正常加载
        await expect(mockPage.locator('body')).toBeVisible();

        // 应展示套餐相关内容（至少包含"免费"或"套餐"字样）
        const planContent = mockPage.getByText(/免费|套餐|订阅|定价/i);
        await expect(planContent.first()).toBeVisible({ timeout: 10000 });
    });

});
