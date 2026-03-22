import { test, expect } from './fixtures';

test.describe('Note Editor E2E', () => {
    // 自动 mock /api/generate
    test.beforeEach(async ({ loggedInPage }) => {
        await loggedInPage.route('/api/generate', async (route) => {
            const mockResponse = '这是 AI 续写的内容...';
            await route.fulfill({
                status: 200,
                body: mockResponse,
            });
        });
    });

    test('should create note and verify editor features', async ({ loggedInPage }) => {
        const page = loggedInPage;

        // 1. 进入笔记列表页
        await page.goto('/notes');
        await page.waitForLoadState('domcontentloaded');

        // 2. 新建笔记
        const createBtn = page.getByRole('button', { name: /新建笔记/i });
        await expect(createBtn).toBeVisible({ timeout: 15000 });
        await createBtn.click();

        // 等待跳转到笔记详情页
        await page.waitForURL(/\/notes\/\d+/);

        // 3. 验证编辑器加载
        const editor = page.locator('.ProseMirror');
        await expect(editor).toBeVisible();
        // 验证占位符 (根据实际配置可能是中文或英文，这里使用模糊匹配或类名)
        await expect(page.locator('p.is-editor-empty')).toBeVisible();

        // 4. 输入文本
        await editor.click();
        await editor.fill('Hello Testing World');
        await expect(page.getByText('Hello Testing World')).toBeVisible();

        // 5. 验证 Slash Command
        await editor.press('Enter');
        await editor.type('/');
        const commandMenu = page.locator('[cmdk-list]');
        await expect(commandMenu).toBeVisible();
        // 验证有 "AI 续写" 选项
        await expect(commandMenu.getByText('AI 续写')).toBeVisible();

        // 关闭菜单
        await editor.press('Escape');

        // 6. 验证 Bubble Menu (AI 助手)
        // 输入一段长文本以便选中
        await editor.fill('Testing AI Selection Bubbles');
        await page.waitForTimeout(500); // 稍微等待编辑器状态同步
        // 使用键盘全选
        await page.keyboard.press('Control+A'); // Windows/Linux
        const isMac = process.platform === 'darwin';
        if (isMac) await page.keyboard.press('Meta+A'); // Mac
        await page.waitForTimeout(500); // 等待 Bubble Menu 动画

        // 验证 Bubble Menu 出现
        // 注意：Bubble Menu 是根据 selection state 渲染的
        const aiButton = page.getByRole('button', { name: /AI 助手|Ask AI/i }).first();
        await expect(aiButton).toBeVisible({ timeout: 10000 });

        // 7. 测试点击 AI 按钮
        await aiButton.click();
        // 验证 AI 输入框出现
        const aiInput = page.getByPlaceholder('告诉 AI 下一步做什么');
        await expect(aiInput).toBeVisible();

        // 验证 AI 续写执行
        // 点击 "继续以此续写" 可以在 AI Selector Commands 中找到，或者直接在输入框输入指令
        // 这里我们选择输入指令
        await aiInput.fill('续写');
        await page.keyboard.press('Enter');

        // 验证 Mock 的 AI 内容是否插入到了编辑器 (依靠之前的 mockResponse)
        // 注意：AI 生成是流式的，可能需要一点时间
        await expect(page.getByText('这是 AI 续写的内容...')).toBeVisible();

        // 8. 验证基本格式化 (Bold)
        await editor.fill('Bold Test');
        await editor.dblclick(); // 选中
        const boldBtn = page.locator('button').filter({ has: page.locator('svg.lucide-bold') });
        await expect(boldBtn).toBeVisible();
        await boldBtn.click();

        // 验证 DOM 中是否存在 strong 标签或 bold 样式
        // Tiptap 通常使用 <strong> 或 style="font-weight: bold"
        const boldText = editor.locator('strong', { hasText: 'Bold Test' });
        await expect(boldText).toBeVisible();
    });
});
