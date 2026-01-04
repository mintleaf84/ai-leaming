
import { test, expect } from '@playwright/test';

test.describe('断点续练机制 (Deep Check)', () => {
  test('做完2题后刷新，应该精确恢复到第3题', async ({ page }) => {
    // 强制开启一个新的 Session (关键修改：?new=true)
    await page.goto('/practice?new=true');
    await expect(page.locator('h2')).toBeVisible({ timeout: 15000 });

    // --- 答题阶段 ---
    
    // 第 1 题：点击第一个选项
    await page.locator('div[role="button"]').first().click();
    // 处理多选情况
    if (await page.getByText('多项选择').isVisible()) {
        await page.getByRole('button', { name: '确认提交' }).click();
    }
    // 等待题目切换 (简单的等待，或者检测题目文本变化)
    await page.waitForTimeout(1000); 

    // 第 2 题：点击第一个选项
    const q2Text = await page.locator('h2').innerText();
    await page.locator('div[role="button"]').first().click();
    if (await page.getByText('多项选择').isVisible()) {
        await page.getByRole('button', { name: '确认提交' }).click();
    }
    
    // 关键等待：确保题目已经切换，意味着第 2 题已提交成功
    await expect(async () => {
        const currentText = await page.locator('h2').innerText();
        expect(currentText).not.toEqual(q2Text);
    }).toPass({ timeout: 10000 });

    // 额外等待：虽然 UI 切了，但后端 DB 写入可能滞后 (Server Action 是异步的)。
    // 给 DB 一点时间写入 logs，否则恢复时的 counts 可能会少 1。
    await page.waitForTimeout(2000);

    // --- 记录现场 ---
    
    // 获取第 3 题的文本，这将是我们的锚点
    await expect(page.locator('h2')).toBeVisible();
    const q3Text = await page.locator('h2').innerText();
    console.log('Question 3 Text:', q3Text);

    // 获取进度条文本 (例如 "题量: 3 / 10")
    const progressText = await page.getByText(/题量:/).innerText();
    expect(progressText).toContain('3 /');

    // --- 模拟中断与恢复 ---

    // 刷新页面
    console.log('Reloading page...');
    await page.reload();

    // 等待恢复提示
    await expect(page.getByText(/欢迎回来/)).toBeVisible({ timeout: 15000 });
    
    // --- 验证恢复准确性 ---

    // 1. 验证题目是否还是第 3 题
    const resumedText = await page.locator('h2').innerText();
    expect(resumedText).toBe(q3Text);

    // 2. 验证进度条是否还是 3
    const resumedProgress = await page.getByText(/题量:/).innerText();
    expect(resumedProgress).toBe(progressText);
  });
});
