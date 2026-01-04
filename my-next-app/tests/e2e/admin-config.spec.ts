import { test, expect } from '@playwright/test';

const ACCESS_CODE = "admin123";

test.describe('Admin API Configuration', () => {

    test.beforeEach(async ({ page }) => {
        // Go to admin page
        await page.goto('/admin');

        // Login
        const passwordInput = page.getByPlaceholder('请输入访问密码...');
        if (await passwordInput.isVisible()) {
            await passwordInput.fill(ACCESS_CODE);
            await page.getByRole('button', { name: '解锁' }).click();
        }

        // Wait for dashboard to load
        await expect(page.getByText('题库管理后台')).toBeVisible();

        // Switch to Settings tab
        await page.getByRole('button', { name: 'AI 配置' }).click();
        await expect(page.getByText('配置列表')).toBeVisible();
    });

    test('should allow creating, editing, activating and deleting an AI config', async ({ page }) => {
        // 1. Create New Config
        const timestamp = Date.now();
        const configName = `Test Config E2E ${timestamp}`;
        await page.getByRole('button', { name: '新建配置' }).click();

        // Fill form
        const testUrl = `https://mock-${timestamp}.api.com/v1`;
        await page.getByPlaceholder('例如：OpenAI, DeepSeek...').fill(configName);
        await page.getByPlaceholder('https://api.openai.com/v1').fill(testUrl);
        await page.getByPlaceholder('sk-...').fill('sk-test-key-12345');

        // Save
        await page.getByRole('button', { name: '保存配置' }).click();

        // Verify it appears in list
        const configRow = page.locator('.border', { hasText: configName });
        await expect(configRow).toBeVisible();
        await expect(configRow.getByText(testUrl)).toBeVisible();

        // 2. Edit Config
        await configRow.getByRole('button', { name: '编辑' }).click();

        // Verify Edit Mode
        await expect(page.getByText('编辑配置')).toBeVisible();

        // Change Name
        const updatedName = `${configName} Updated`;
        await page.getByPlaceholder('例如：OpenAI, DeepSeek...').fill(updatedName);
        await page.getByRole('button', { name: '保存配置' }).click();

        // Verify Update
        await expect(page.getByText(updatedName)).toBeVisible();

        // 3. Activate Config
        const updatedRow = page.locator('.border', { hasText: updatedName });
        // Click Activate
        await updatedRow.getByRole('button', { name: '激活' }).click();

        // Verify Active Status (Check mark or "当前使用")
        await expect(updatedRow.getByText('当前使用')).toBeVisible();

        // 4. Delete Config
        // Cannot delete active config. So we must switch back to another config first.
        // Let's find "Default Config" (created by migration) or any other config.
        // Assuming "Default Config" exists or at least one other config exists due to migration.

        // If there is another config, activate it.
        const otherRow = page.locator('.border').first();
        // If first row is our updated config, pick the second one.
        // If we are the only config, we can't delete. 

        // Let's check count.
        const count = await page.locator('.border', { hasText: 'Base URL' }).count();
        if (count > 1) {
            // Activate the first one that is NOT our test config and NOT already active
            // We can search for a row that contains the '激活' button which means it's inactive
            const inactiveRow = page.locator('.border').filter({ has: page.getByRole('button', { name: '激活' }) }).first();

            if (await inactiveRow.count() > 0) {
                await inactiveRow.getByRole('button', { name: '激活' }).click();
            } else {
                console.log("Could not find another inactive config to switch to.");
            }

            // Now delete our test config
            // Locate our row again as DOM might have refreshed
            const targetRow = page.locator('.border', { hasText: updatedName });

            // Handle confirm dialog
            page.on('dialog', dialog => dialog.accept());

            await targetRow.getByRole('button', { name: '删除' }).click();

            // Verify deletion
            await expect(page.getByText(updatedName)).not.toBeVisible();
        } else {
            console.log("Skipping delete test as there is only one config.");
        }
    });

});
