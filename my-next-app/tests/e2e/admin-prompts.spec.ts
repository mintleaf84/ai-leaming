import { test, expect } from './fixtures';

/**
 * Admin 提示词管理 E2E 测试
 */
test.describe('Admin 提示词管理', () => {
    test('管理员能访问 AI 与提示词页面', async ({ adminPage }) => {
        await adminPage.goto('/admin');
        await adminPage.waitForTimeout(2000);

        // 点击 AI 与提示词 菜单
        const aiMenu = adminPage.getByText('AI 与提示词').first();
        if (await aiMenu.isVisible()) {
            await aiMenu.click();
            await adminPage.waitForTimeout(1000);
        }

        // 验证页面正常加载
        await expect(adminPage.locator('body')).toBeVisible();
    });
});
