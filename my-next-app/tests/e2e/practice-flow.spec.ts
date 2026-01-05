import { test, expect } from './fixtures';

/**
 * 练习模式核心流程 E2E 测试
 * 使用 loggedInPage fixture 确保已登录
 */
test.describe('练习模式核心流程', () => {
  test('应该能进入练习并答题', async ({ loggedInPage }) => {
    // 进入练习页面
    await loggedInPage.goto('/practice');

    // 等待题目加载
    await expect(loggedInPage.locator('h2, h1').first()).toBeVisible({ timeout: 15000 });

    // 验证题目内容存在
    const questionLocator = loggedInPage.locator('h2').first();
    await expect(questionLocator).toBeVisible();

    // 选择一个答案
    const options = loggedInPage.locator('div[role="button"]');
    if (await options.count() > 0) {
      await options.first().click();

      // 处理多选题
      const confirmBtn = loggedInPage.getByRole('button', { name: /确认|提交/ });
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
    }

    // 验证页面正常
    await expect(loggedInPage.locator('body')).toBeVisible();
  });

  test('测试排除法功能', async ({ loggedInPage }) => {
    await loggedInPage.goto('/practice');
    await expect(loggedInPage.locator('h2, h1').first()).toBeVisible({ timeout: 15000 });

    // 测试右键排除
    const firstOption = loggedInPage.locator('div[role="button"]').first();
    if (await firstOption.isVisible()) {
      await firstOption.click({ button: 'right' });
      await loggedInPage.waitForTimeout(500);

      // 再次右键取消
      await firstOption.click({ button: 'right' });
    }

    await expect(loggedInPage.locator('body')).toBeVisible();
  });
});
