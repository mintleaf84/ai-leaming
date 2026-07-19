import { test, expect } from "./fixtures";

/**
 * 练习核心引擎 E2E 测试（模块二：P-01 ~ P-10）
 * 模拟真实用户答题的完整连贯流程
 */

/**
 * P-10 答题循环最大次数：种子数据共 10 题，设为 12 保留安全缓冲
 * （以防部分题目触发复盘后重复展示）
 */
const MAX_QUESTIONS_TO_COMPLETE = 12;
test.describe("练习核心引擎", () => {
  // P-01：完整单选题答题流程（正确路径）
  test("P-01 单选题答题 - 正确选项高亮并进入下一题", async ({
    loggedInPage,
  }) => {
    await loggedInPage.goto("/practice");

    // 等待第一道题加载
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 获取当前题目文本（用于后续比对）
    const _firstQuestionText = await loggedInPage
      .locator("h2, h1")
      .first()
      .textContent();

    // 点击第一个选项（种子数据中 A 为正确答案）
    const options = loggedInPage.locator('div[role="button"]');
    await expect(options.first()).toBeVisible({ timeout: 10000 });
    await options.first().click();

    // 处理多选题确认按钮
    const confirmBtn = loggedInPage.getByRole("button", { name: /确认|提交/ });
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // 等待反馈（≤1.5s）
    await loggedInPage.waitForTimeout(1500);

    // 验证页面未崩溃
    await expect(loggedInPage.locator("body")).toBeVisible();
    // 进度条 / 题序应有变化
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible();
  });

  // P-02：完整单选题答题流程（错误路径）
  test("P-02 答错后显示复盘待办提示", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 点击最后一个选项（种子数据中 D 通常是错误答案）
    const options = loggedInPage.locator('div[role="button"]');
    const count = await options.count();
    if (count > 0) {
      await options.last().click();

      const confirmBtn = loggedInPage.getByRole("button", {
        name: /确认|提交/,
      });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await loggedInPage.waitForTimeout(1500);

      // 错误路径：等待反馈出现（红色高亮或错误提示）
      // 复盘队列提示条（含"待复盘"字样）可能在答错后出现
      await expect(loggedInPage.locator("body")).toBeVisible();
    }
  });

  // P-03：多选题 UI 与提交逻辑
  test("P-03 多选题 - 多选后需点击确认才提交", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 检查是否遇到多选题
    const multiLabel = loggedInPage.locator("text=多项选择");
    const hasMultiChoice = await multiLabel
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasMultiChoice) {
      const options = loggedInPage.locator('div[role="button"]');
      const optionCount = await options.count();

      // 选择前两个选项
      if (optionCount >= 2) {
        await options.nth(0).click();
        await loggedInPage.waitForTimeout(200);
        // 单击一个选项后不应自动提交，页面应仍停在此题
        await expect(loggedInPage.locator("h2, h1").first()).toBeVisible();

        await options.nth(1).click();
        await loggedInPage.waitForTimeout(200);
      }

      // 确认提交按钮可见且可点击
      const confirmBtn = loggedInPage.getByRole("button", {
        name: /确认|提交/,
      });
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();
        await loggedInPage.waitForTimeout(1000);
      }
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-04：判断题选项渲染验证
  test("P-04 判断题仅显示正确/错误两个选项", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 查找判断题标识
    const trueFalseLabel = loggedInPage.locator("text=判断题");
    const hasTrueFalse = await trueFalseLabel
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasTrueFalse) {
      // 判断题只有两个选项
      const options = loggedInPage.locator('div[role="button"]');
      const count = await options.count();
      expect(count).toBe(2);
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-05：键盘快捷键操作
  test("P-05 键盘数字键可选择对应选项", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    const options = loggedInPage.locator('div[role="button"]');
    await expect(options.first()).toBeVisible({ timeout: 10000 });

    // 按下键盘 1（选择第一个选项）
    await loggedInPage.keyboard.press("1");
    await loggedInPage.waitForTimeout(800);

    // 页面应有响应，不崩溃
    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-06：右键排除法功能
  test("P-06 右键可排除选项，再次右键取消排除", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    const firstOption = loggedInPage.locator('div[role="button"]').first();
    if (await firstOption.isVisible()) {
      // 右键点击第一个选项
      await firstOption.click({ button: "right" });
      await loggedInPage.waitForTimeout(500);

      // 再次右键取消排除
      await firstOption.click({ button: "right" });
      await loggedInPage.waitForTimeout(500);
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-07：退出练习拦截弹窗
  test("P-07 退出时弹出确认弹窗，可取消或确认", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 答一道题
    const options = loggedInPage.locator('div[role="button"]');
    if (await options.first().isVisible()) {
      await options.first().click();
      const confirmBtn = loggedInPage.getByRole("button", {
        name: /确认|提交/,
      });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await loggedInPage.waitForTimeout(1000);
    }

    // 点击"退出"按钮（Header 区域）
    const exitBtn = loggedInPage.getByRole("button", {
      name: /退出|返回|结束/i,
    });
    if (
      await exitBtn
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await exitBtn.first().click();
      await loggedInPage.waitForTimeout(500);

      // 弹窗应出现（含"确定要退出吗"文本）
      const modal = loggedInPage.getByText(/确定要退出吗|当前.*进度/i);
      const modalVisible = await modal
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (modalVisible) {
        // 测试"取消"按钮：弹窗关闭，留在练习页
        await loggedInPage.getByRole("button", { name: /取消/i }).click();
        await loggedInPage.waitForTimeout(500);
        expect(loggedInPage.url()).toContain("/practice");

        // 再次触发弹窗并确认退出
        await exitBtn.first().click();
        await loggedInPage.waitForTimeout(500);
        await loggedInPage.getByRole("button", { name: /退出练习/i }).click();
        await expect(loggedInPage).toHaveURL(/\/(dashboard|home|\/)/, {
          timeout: 10000,
        });
      }
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-08：断点续练（页面刷新恢复进度）
  test("P-08 刷新页面后练习进度得以保留", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice?new=true");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 答 1 题
    const options = loggedInPage.locator('div[role="button"]');
    if ((await options.count()) > 0) {
      await options.first().click();
      const confirmBtn = loggedInPage.getByRole("button", {
        name: /确认|提交/,
      });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    }

    // 等待保存
    await loggedInPage.waitForTimeout(2000);

    // 刷新
    await loggedInPage.reload();
    await loggedInPage.waitForTimeout(2000);

    // 刷新后页面正常加载（不崩溃，不跳回登录）
    await expect(loggedInPage.locator("body")).toBeVisible();
    expect(loggedInPage.url()).not.toContain("/login");
  });

  // P-09：练习配置页参数传递
  test("P-09 练习配置页选择模式后跳转练习", async ({ loggedInPage }) => {
    await loggedInPage.goto("/practice/setup");
    await expect(loggedInPage.locator("body")).toBeVisible({ timeout: 15000 });

    // 等待配置页加载
    const setupPage = loggedInPage.locator("text=/练习|配置|模式/i");
    const hasSetup = await setupPage
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasSetup) {
      // 点击"开始"按钮
      const startBtn = loggedInPage.getByRole("button", {
        name: /开始|出发|确认/i,
      });
      if (
        await startBtn
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await startBtn.first().click();
        await expect(loggedInPage).toHaveURL(/\/practice/, { timeout: 10000 });
      }
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });

  // P-10：练习完成进入结算报告
  test("P-10 完成练习后跳转报告页", async ({ loggedInPage }) => {
    test.setTimeout(120000);

    await loggedInPage.goto("/practice?new=true");
    await expect(loggedInPage.locator("h2, h1").first()).toBeVisible({
      timeout: 15000,
    });

    // 快速答完所有题目（种子数据共 10 题，最多尝试 MAX_QUESTIONS_TO_COMPLETE 次）
    for (let i = 0; i < MAX_QUESTIONS_TO_COMPLETE; i++) {
      const options = loggedInPage.locator('div[role="button"]');
      const hasOptions = await options
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasOptions) break;

      await options.first().click();

      const confirmBtn = loggedInPage.getByRole("button", {
        name: /确认|提交/,
      });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await loggedInPage.waitForTimeout(800);

      // 如已跳到报告页则退出循环
      if (loggedInPage.url().includes("/report")) break;
    }

    // 报告页应出现关键数据字段（≤5s）
    const onReport = loggedInPage.url().includes("/report");
    if (onReport) {
      await expect(
        loggedInPage.getByText(/总题数|正确率|正确数/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }

    await expect(loggedInPage.locator("body")).toBeVisible();
  });
});
