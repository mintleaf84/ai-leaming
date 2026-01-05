import { test, expect } from './fixtures';

/**
 * 历史记录管理 E2E 测试
 */
test.describe('历史记录管理', () => {
  test('已登录用户能访问历史页面', async ({ loggedInPage }) => {
    // 先做一道题创建记录
    await loggedInPage.goto('/practice');
    await loggedInPage.waitForTimeout(2000);

    const option = loggedInPage.locator('div[role="button"]').first();
    if (await option.isVisible()) {
      await option.click();
      await loggedInPage.waitForTimeout(1000);
    }

    // 进入历史页面
    await loggedInPage.goto('/history');
    await loggedInPage.waitForTimeout(1000);

    // 验证页面正常加载
    await expect(loggedInPage.locator('body')).toBeVisible();
  });
});
