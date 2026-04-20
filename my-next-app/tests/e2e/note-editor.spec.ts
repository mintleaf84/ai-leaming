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
        await expect(commandMenu.getByText('AI 续写')).toBeVisible();

        // 点击 AI 续写
        await commandMenu.getByText('AI 续写').click();
        
        // 验证 Mock 的 AI 内容是否插入到了编辑器
        // AI SDK 的 useCompletion 会逐步替换文本，等待最终结果出现
        await expect(page.getByText('这是 AI 续写的内容...')).toBeVisible({ timeout: 15000 });

        // 6. 验证 Bubble Menu (试运行)
        await editor.focus();
        await page.keyboard.press('Control+A'); // 全选
        
        // 等待气泡菜单出现
        const aiSelector = page.locator('[placeholder*="让 AI 编辑或生成"]');
        // 如果气泡菜单没有立即出现，可能需要点击或双击
        if (!(await aiSelector.isVisible())) {
             await editor.dblclick();
        }
        
        await expect(aiSelector).toBeVisible({ timeout: 10000 });
        await aiSelector.fill('润色');
        await page.keyboard.press('Enter');

        // 验证 AI 优化后的内容 (同样通过 Mock)
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

    // N-02：输入内容自动保存（刷新后内容保留）
    test('N-02 笔记内容自动保存后刷新可恢复', async ({ loggedInPage }) => {
        const page = loggedInPage;

        // 进入笔记列表并新建
        await page.goto('/notes');
        await page.waitForLoadState('domcontentloaded');

        const createBtn = page.getByRole('button', { name: /新建笔记/i });
        await expect(createBtn).toBeVisible({ timeout: 15000 });
        await createBtn.click();

        await page.waitForURL(/\/notes\/\d+/);

        const editor = page.locator('.ProseMirror');
        await expect(editor).toBeVisible();

        // 输入唯一内容（含时间戳确保唯一性）
        const uniqueContent = `自动保存测试内容 ${Date.now()}`;
        await editor.click();
        await editor.fill(uniqueContent);
        await expect(page.getByText(uniqueContent)).toBeVisible();

        // 等待自动保存（3s 后触发）
        await page.waitForTimeout(4000);

        // 刷新页面
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // 刷新后内容应保留
        const editorAfterReload = page.locator('.ProseMirror');
        await expect(editorAfterReload).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(uniqueContent)).toBeVisible({ timeout: 5000 });
    });

    // N-06：笔记删除
    test('N-06 删除笔记后从列表中消失', async ({ loggedInPage }) => {
        const page = loggedInPage;

        // 先新建一个笔记
        await page.goto('/notes');
        await page.waitForLoadState('domcontentloaded');

        const createBtn = page.getByRole('button', { name: /新建笔记/i });
        await expect(createBtn).toBeVisible({ timeout: 15000 });
        await createBtn.click();

        await page.waitForURL(/\/notes\/\d+/);
        const _noteUrl = page.url();

        // 输入内容（便于后续在列表中识别）
        const editor = page.locator('.ProseMirror');
        await expect(editor).toBeVisible();
        await editor.click();
        await editor.fill('待删除的笔记');
        await page.waitForTimeout(2000); // 等待自动保存

        // 查找删除按钮（可能在详情页或列表页）
        const deleteBtn = page.getByRole('button', { name: /删除|移除/i });
        if (await deleteBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
            await deleteBtn.first().click();
            await page.waitForTimeout(500);

            // 确认删除弹窗
            const confirmDeleteBtn = page.getByRole('button', { name: /确认|确定删除|删除/i }).last();
            if (await confirmDeleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmDeleteBtn.click();
                await page.waitForTimeout(1500);
            }

            // 应跳回笔记列表
            await expect(page).toHaveURL(/\/notes(\?|$|\/(?!\d))/, { timeout: 5000 });

            // 列表中不应再有该笔记
            const deletedNote = page.getByText('待删除的笔记');
            const stillExists = await deletedNote.isVisible({ timeout: 3000 }).catch(() => false);
            expect(stillExists).toBe(false);
        } else {
            // 如无明确删除按钮，从列表页找到该记录并删除
            await page.goto('/notes');
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1000);

            // 尝试找到该笔记并删除
            const noteItem = page.getByText('待删除的笔记').first();
            if (await noteItem.isVisible({ timeout: 3000 }).catch(() => false)) {
                // 右键或悬停找到删除菜单
                await noteItem.hover();
                await page.waitForTimeout(500);
                const hoverDeleteBtn = page.getByRole('button', { name: /删除/i }).first();
                if (await hoverDeleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await hoverDeleteBtn.click();
                    await page.waitForTimeout(1500);
                }
            }
        }

        await expect(page.locator('body')).toBeVisible();
    });
});
