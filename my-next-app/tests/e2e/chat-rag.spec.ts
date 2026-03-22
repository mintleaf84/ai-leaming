import { test, expect } from './fixtures';

/**
 * AI 聊天 RAG 功能 E2E 测试
 */
test.describe('AI 聊天 RAG 功能', () => {
    test('应该能通过知识库增强回答问题', async ({ loggedInPage }) => {
        const uniqueKey = `E2E_TEST_${Date.now()}`;
        const testKnowledge = {
            title: `测试知识点_${uniqueKey}`,
            category: '自动化测试',
            front: `什么是 ${uniqueKey}？`,
            back: `这是一个专为 E2E 测试准备的独特答案：${uniqueKey}_SECRET_ANSWER。`,
            tags: ['E2E', 'RAG']
        };

        // 1. 进入知识库页面并添加卡片
        await loggedInPage.goto('/knowledge');
        await loggedInPage.getByRole('button', { name: /添加|新增/i }).first().click();

        // 等待弹窗并填写
        await loggedInPage.getByPlaceholder(/例如：广域课程的定义/).fill(testKnowledge.title);
        await loggedInPage.getByPlaceholder(/教育学基础/).fill(testKnowledge.category);
        await loggedInPage.getByPlaceholder(/输入要记忆的问题/).fill(testKnowledge.front);
        await loggedInPage.getByPlaceholder(/输入详细的解释和答案/).fill(testKnowledge.back);
        
        // 点击保存
        await loggedInPage.getByRole('button', { name: /完成并同步/i }).click();

        // 验证卡片出现在列表中
        await expect(loggedInPage.getByText(testKnowledge.title)).toBeVisible({ timeout: 10000 });

        // 2. 进入聊天页面
        await loggedInPage.goto('/chat');
        await loggedInPage.waitForTimeout(1000);

        // 确保 RAG 开关开启 (如果默认关闭)
        const ragStatus = loggedInPage.locator('span', { hasText: /知识库增强已/ });
        const isRagEnabled = (await ragStatus.innerText()).includes('已启用');
        
        if (!isRagEnabled) {
             // 根据 ChatInput.tsx，按钮紧跟在状态文本后面
             await loggedInPage.locator('button[type="button"]').filter({ has: loggedInPage.locator('span.pointer-events-none') }).click();
        }
        await expect(loggedInPage.getByText('知识库增强已启用')).toBeVisible();

        // 3. 模拟 AI 返回包含知识库内容的回复 (覆盖 fixtures 中的默认 Mock)
        await loggedInPage.route('**/api/chat', async (route) => {
            const chunks = [
                `根据我的检索结果，${uniqueKey} 是一个专为 E2E 测试准备的独特内容。`,
                `这里的秘密答案是：${uniqueKey}_SECRET_ANSWER。`,
                "希望这能帮到你！"
            ].map((text, i) => {
                const data = JSON.stringify({
                    id: `mock-rag-${i}`,
                    object: 'chat.completion.chunk',
                    choices: [{ delta: { content: text }, index: 0 }]
                });
                return `0:${JSON.stringify(text)}\n`; // 匹配 Hono/AI SDK 的 0:"..." 格式
            });

            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: chunks.join(''),
            });
        });

        // 4. 发送提问
        const textarea = loggedInPage.locator('textarea');
        await textarea.fill(`请问 ${uniqueKey} 是什么？`);
        await loggedInPage.getByRole('button', { name: /发送|send/i }).click();

        // 5. 验证回复内容
        await expect(loggedInPage.getByText(`${uniqueKey}_SECRET_ANSWER`)).toBeVisible({ timeout: 30000 });
    });
});
