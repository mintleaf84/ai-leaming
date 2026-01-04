import { test, expect } from '@playwright/test';

const ACCESS_CODE = "admin123";

test.describe('Admin Prompt Management', () => {
    test.slow(); // Enhance timeout tolerance

    test.beforeEach(async ({ page }) => {
        // Capture browser logs
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err));

        await page.goto('/admin');
        const passwordInput = page.getByPlaceholder('请输入访问密码...');
        if (await passwordInput.isVisible()) {
            await passwordInput.fill(ACCESS_CODE);
            await page.getByRole('button', { name: '解锁' }).click();
        }
        await expect(page.getByText('题库管理后台')).toBeVisible();

        // Navigate to Prompts tab
        await page.getByRole('button', { name: '提示词工程' }).click();
        await expect(page.getByText('提示词列表')).toBeVisible();
    });

    test('should allow viewing, editing and resetting a prompt', async ({ page }) => {
        // 1. Select a prompt (Correction Quiz)
        await page.locator('button').filter({ hasText: '纠偏找茬 (Correction Quiz)' }).click();

        // 2. Verify Editor Loaded with defaults
        const editor = page.locator('textarea');
        await expect(editor).toBeVisible();
        await expect(page.getByText('可用变量: ${questionContent}')).toBeVisible();

        // 3. Edit Prompt
        const testPrompt = `Test Prompt E2E ${Date.now()}: \${questionContent}`;
        await editor.fill(testPrompt);

        // 4. Save
        await page.getByRole('button', { name: '保存' }).click();
        await expect(page.getByText('提示词已保存')).toBeVisible(); // Check toast

        // 5. Reload and Verify Persistence
        await page.reload();
        await expect(page.getByText('题库管理后台')).toBeVisible();
        await page.getByRole('button', { name: '提示词工程' }).click();
        await expect(page.getByText('提示词列表')).toBeVisible();

        await page.locator('button').filter({ hasText: '纠偏找茬 (Correction Quiz)' }).click();
        await expect(editor).toHaveValue(testPrompt);

        // 6. Reset Prompt
        page.on('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: '重置' }).click();
        await expect(page.getByText('已重置')).toBeVisible(); // Check toast

        // Verify default state
        // Verify default state
        await expect(editor).toHaveValue('');
        // Check for the ghost overlay text (part of default prompt)
        await expect(page.getByText('你是一个教育专家')).toBeVisible();
        await expect(page.getByText('当前无内容')).not.toBeVisible();
    });

    test('should show debug playground', async ({ page }) => {
        await page.locator('button').filter({ hasText: '纠偏找茬 (Correction Quiz)' }).click();

        await expect(page.getByText('调试 Playground')).toBeVisible();
        await expect(page.getByText('输入变量')).toBeVisible();

        // Assert pre-filled values
        // For 'correction_quiz', questionContent should be pre-filled
        const input = page.getByPlaceholder('输入 questionContent...');
        await expect(input).toBeVisible();
        await expect(input).toHaveValue(/文老师班里的小亮同学/);

        await expect(page.getByRole('button', { name: '运行测试' })).toBeVisible();
    });
});
