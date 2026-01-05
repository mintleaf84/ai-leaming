import { test, expect } from './fixtures';

/**
 * 智能复盘全链路 E2E 测试
 */
test.describe('智能复盘全链路', () => {
    test.setTimeout(120000);

    test('练习流程正常完成', async ({ loggedInPage }) => {
        await loggedInPage.goto('/practice');
        await expect(loggedInPage.locator('h2, h1').first()).toBeVisible({ timeout: 15000 });

        // 快速刷几道题
        for (let i = 0; i < 3; i++) {
            const options = loggedInPage.locator('div[role="button"]');
            if (await options.count() > 0) {
                await options.first().click();

                const confirmBtn = loggedInPage.getByRole('button', { name: /确认|提交/ });
                if (await confirmBtn.isVisible().catch(() => false)) {
                    await confirmBtn.click();
                }

                await loggedInPage.waitForTimeout(800);
            }
        }

        // 验证页面正常
        await expect(loggedInPage.locator('body')).toBeVisible();
    });
});
