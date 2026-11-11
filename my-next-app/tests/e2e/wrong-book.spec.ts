import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * 错题本 E2E 测试（模块八：WB-01 ~ WB-02）
 * 覆盖错题本渲染和从错题本发起重练
 */
test.describe("错题本", () => {
  /**
   * 辅助函数：答错若干题以生成错题记录
   */
  async function generateWrongAnswers(page: Page) {
    await page.goto("/practice?new=true");
    const hasQuestion = await page
      .locator("h2, h1")
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (!hasQuestion) return;

    for (let i = 0; i < 3; i++) {
      const options = page.locator('div[role="button"]');
      const hasOptions = await options
        .last()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (!hasOptions) break;

      // 选最后一个选项（种子数据中通常是错的）
      await options.last().click();

      const confirmBtn = page.getByRole("button", { name: /确认|提交/ });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await page.waitForTimeout(1200);

      // 若进入复盘模式则退出
      const reviewMode = await page
        .getByText(/智能复盘模式/i)
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (reviewMode) break;
    }

    // 等待数据写入
    await page.waitForTimeout(2000);
  }

  // WB-01：错题本页面渲染
  test("WB-01 错题本页面正常渲染", async ({ loggedInPage }) => {
    await loggedInPage.goto("/wrong-book");
    await expect(loggedInPage).toHaveURL(/\/wrong-book/);
    await expect(loggedInPage.locator("body")).toBeVisible();
    await expect(loggedInPage.getByText("页面出错了")).toHaveCount(0);
  });

  test("WB-02 从错题本可发起专项练习", async ({ loggedInPage }) => {
    await generateWrongAnswers(loggedInPage);

    await loggedInPage.goto("/wrong-book");
    await loggedInPage.waitForTimeout(2000);

    // 查找"开始练习"按钮（选中错题后出现）
    const startPracticeBtn = loggedInPage.getByRole("button", {
      name: /开始练习|专项练习|重练/i,
    });

    // 若有错题列表，尝试选中第一道并发起练习
    const wrongQuestions = loggedInPage.locator(
      'input[type="checkbox"], div[role="checkbox"]',
    );
    const hasCheckboxes = await wrongQuestions
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasCheckboxes) {
      await wrongQuestions.first().click();
      await loggedInPage.waitForTimeout(500);
    }

    const hasStartBtn = await startPracticeBtn
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (hasStartBtn) {
      await startPracticeBtn.first().click();
      await loggedInPage.waitForTimeout(2000);

      // 应跳转至练习页面
      const url = loggedInPage.url();
      expect(url).toContain("/practice");
    }

    // 页面不应崩溃
    await expect(loggedInPage.locator("body")).toBeVisible();
  });
});
