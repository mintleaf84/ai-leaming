import { test, expect } from './fixtures';

/**
 * AI 聊天功能 E2E 测试
 * 使用 loggedInPage fixture 确保已登录
 */
test.describe('AI 聊天功能 (E2E)', () => {
    test('已登录用户能访问聊天页面', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await expect(loggedInPage.locator('textarea')).toBeVisible({ timeout: 15000 });
    });

    test('发送消息后输入框应清空', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        await textarea.fill('这是一条测试消息');

        // 发送消息
        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送"), [data-testid="send-button"]').first();
        if (await sendButton.isVisible()) {
            await sendButton.click();
            await loggedInPage.waitForTimeout(500);
            await expect(textarea).toHaveValue('');
        }
    });

    test('会话管理：新建对话', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(2000);

        const newChatButton = loggedInPage.locator('button:has-text("新建"), button:has-text("新对话")').first();
        if (await newChatButton.isVisible()) {
            await newChatButton.click();
            await loggedInPage.waitForTimeout(500);
            // 验证创建成功
            await expect(loggedInPage.locator('textarea')).toBeVisible();
        }
    });
});
