
import { test, expect } from '@playwright/test';

/**
 * AI 聊天功能 E2E 测试
 * 策略：验证用户交互和 UI 状态切换，不依赖 AI 响应内容解析
 */
test.describe('AI 聊天功能 (E2E)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/chat');
        await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    });

    test('发送消息后输入框应清空', async ({ page }) => {
        const textarea = page.locator('textarea');
        await textarea.fill('这是一条测试消息');
        await page.getByTestId('send-button').click();
        await expect(textarea).toHaveValue('');
    });

    test('会话管理：新建对话', async ({ page }) => {
        await expect(page.locator('.group.relative.rounded-lg').first()).toBeVisible({ timeout: 10000 });
        const initialCount = await page.locator('.group.relative.rounded-lg').count();

        await page.click('button:has-text("新建对话")');

        await expect(page.locator('.group.relative.rounded-lg')).toHaveCount(initialCount + 1);
    });
});
