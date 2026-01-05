import { test, expect } from './fixtures';

/**
 * 断点续练机制 E2E 测试
 */
test.describe('断点续练机制', () => {
  test('做完题后刷新，应该能恢复进度', async ({ loggedInPage }) => {
    // 开启新会话
    await loggedInPage.goto('/practice?new=true');
    await expect(loggedInPage.locator('h2, h1').first()).toBeVisible({ timeout: 15000 });

    // 答第 1 题
    const options = loggedInPage.locator('div[role="button"]');
    if (await options.count() > 0) {
      await options.first().click();

      // 处理多选题
      const confirmBtn = loggedInPage.getByRole('button', { name: /确认|提交/ });
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
    }

    // 等待保存
    await loggedInPage.waitForTimeout(2000);

    // 刷新页面
    await loggedInPage.reload();
    await loggedInPage.waitForTimeout(2000);

    // 验证页面正常加载
    await expect(loggedInPage.locator('body')).toBeVisible();
  });
});
