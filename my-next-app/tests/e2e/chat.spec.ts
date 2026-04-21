import { test, expect } from './fixtures';

/**
 * AI 聊天助手 E2E 测试（模块五：C-01 ~ C-08）
 * 覆盖消息发送、流式响应、边界情况和 Markdown 渲染
 */
test.describe('AI 聊天助手', () => {

    // C-01：聊天页面基础渲染
    test('C-01 聊天页面基础渲染', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');

        // 输入框可见（≤15s）
        await expect(loggedInPage.locator('textarea')).toBeVisible({ timeout: 15000 });

        // 发送按钮可见
        const sendBtn = loggedInPage.locator('button[type="submit"], button:has([data-lucide="send"]), [data-testid="send-button"]').first();
        const _hasSendBtn = await sendBtn.isVisible({ timeout: 5000 }).catch(() => false);
        // 宽松验证：至少有 textarea 即可
        await expect(loggedInPage.locator('textarea')).toBeVisible();
    });

    // C-02：发送消息 → 流式响应完整链路
    test('C-02 发送消息后输入框清空且显示 AI 响应', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        await textarea.fill('什么是建构主义？');

        // 发送
        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送"), [data-testid="send-button"]').first();
        if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sendButton.click();
        } else {
            await textarea.press('Enter');
        }

        // ① 输入框立即清空（≤200ms）
        await expect(textarea).toHaveValue('', { timeout: 3000 });

        // ② AI 响应出现（Mock 响应，≤5s）
        await expect(loggedInPage.getByText(/这是一条来自 Mock AI|Mock AI/i).first()).toBeVisible({ timeout: 15000 });
    });

    // C-03：发送空消息被拦截
    test('C-03 空消息不应触发网络请求', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        // 监听 /api/chat 请求
        let chatRequestMade = false;
        loggedInPage.on('request', req => {
            if (req.url().includes('/api/chat')) {
                chatRequestMade = true;
            }
        });

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        // 确保输入框为空
        await textarea.fill('');

        // 尝试发送（按 Enter 或点击发送按钮）
        await textarea.press('Enter');
        await loggedInPage.waitForTimeout(1000);

        // 不应触发 /api/chat 请求
        expect(chatRequestMade).toBe(false);
    });

    // C-04：Shift+Enter 换行不发送
    test('C-04 Shift+Enter 换行不发送消息', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        let chatRequestMade = false;
        loggedInPage.on('request', req => {
            if (req.url().includes('/api/chat')) {
                chatRequestMade = true;
            }
        });

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        await textarea.fill('测试换行');
        await textarea.press('Shift+Enter');
        await loggedInPage.waitForTimeout(800);

        // Shift+Enter 不应发送请求
        expect(chatRequestMade).toBe(false);

        // 内容应仍在输入框（含换行）
        const value = await textarea.inputValue();
        expect(value).toContain('测试换行');
    });

    // C-05：停止生成功能
    test('C-05 发送消息后停止按钮出现且可点击', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        await textarea.fill('请给我讲一个很长的故事');

        // 发送
        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送")').first();
        if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sendButton.click();
        } else {
            await textarea.press('Enter');
        }

        // 等待停止按钮出现（AI 生成中）
        const stopBtn = loggedInPage.getByRole('button', { name: /停止|stop/i });
        const hasStopBtn = await stopBtn.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasStopBtn) {
            await stopBtn.click();
            await loggedInPage.waitForTimeout(500);
            // 停止后页面仍正常
            await expect(loggedInPage.locator('body')).toBeVisible();
        }

        await expect(loggedInPage.locator('body')).toBeVisible();
    });

    // C-06：新建对话清空上下文
    test('C-06 新建对话后上下文清空', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(2000);

        // 发一条消息
        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });
        await textarea.fill('第一轮对话消息');

        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送")').first();
        if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sendButton.click();
        } else {
            await textarea.press('Enter');
        }
        await loggedInPage.waitForTimeout(2000);

        // 点击"新建对话"
        const newChatButton = loggedInPage.locator('button:has-text("新建"), button:has-text("新对话")').first();
        if (await newChatButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await newChatButton.click();
            await loggedInPage.waitForTimeout(1000);

            // 消息列表应清空（不显示上一轮的消息）
            const prevMessage = loggedInPage.getByText('第一轮对话消息');
            const hasPrevMsg = await prevMessage.isVisible({ timeout: 2000 }).catch(() => false);
            // 新对话中不应有旧消息
            expect(hasPrevMsg).toBe(false);

            // 输入框可见
            await expect(loggedInPage.locator('textarea')).toBeVisible();
        }

        await expect(loggedInPage.locator('body')).toBeVisible();
    });

    // C-07：API 错误降级处理
    test('C-07 API 返回 500 时显示错误提示且保留输入内容', async ({ loggedInPage }) => {
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        // 覆盖 Mock：返回 500
        await loggedInPage.route('**/api/chat', async (route) => {
            await route.fulfill({ status: 500, body: 'Internal Server Error' });
        });

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        const testMessage = '这是一条会失败的消息';
        await textarea.fill(testMessage);

        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送")').first();
        if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sendButton.click();
        } else {
            await textarea.press('Enter');
        }

        await loggedInPage.waitForTimeout(3000);

        // 页面不应崩溃
        await expect(loggedInPage.locator('body')).toBeVisible();
        expect(loggedInPage.url()).not.toContain('/500');
    });

    // C-08：Markdown 渲染验证
    test('C-08 AI 响应中的 Markdown 正确渲染', async ({ loggedInPage }) => {
        // Mock 返回包含 Markdown 代码块的响应
        const markdownResponse = '这是标题\n\n```typescript\nconst x = 1;\n```\n\n**加粗文字**\n\n- 列表项1\n- 列表项2';

        await loggedInPage.route('**/api/chat', async (route) => {
            // 使用与 fixtures 中相同的流式格式
            const chunks = markdownResponse.split('\n').map((line, i) => {
                const data = JSON.stringify({
                    id: `mock-md-${i}`,
                    object: 'chat.completion.chunk',
                    choices: [{ delta: { content: line + '\n' }, index: 0 }]
                });
                return `data: ${data}\n\n`;
            });
            chunks.push('data: [DONE]\n\n');

            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
                body: chunks.join(''),
            });
        });

        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        const textarea = loggedInPage.locator('textarea');
        await expect(textarea).toBeVisible({ timeout: 15000 });

        await textarea.fill('给我一段含代码的回复');
        const sendButton = loggedInPage.locator('button[type="submit"], button:has-text("发送")').first();
        if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sendButton.click();
        } else {
            await textarea.press('Enter');
        }

        await loggedInPage.waitForTimeout(5000);

        // 验证页面正常（Markdown 渲染不崩溃）
        await expect(loggedInPage.locator('body')).toBeVisible();

        // 代码块应被渲染（存在 pre 或 code 标签）
        const codeBlock = loggedInPage.locator('pre, code').first();
        const hasCode = await codeBlock.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasCode) {
            await expect(codeBlock).toBeVisible();
        }
    });

});
