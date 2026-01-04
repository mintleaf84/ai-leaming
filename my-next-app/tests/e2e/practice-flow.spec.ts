
import { test, expect } from '@playwright/test';

test.describe('练习模式核心流程', () => {
  test('应该能进入练习，使用排除法，并提交答案', async ({ page }) => {
    // 1. 进入首页
    await page.goto('/');
    
    // 2. 点击“开始练习”
    // 假设首页有这个链接，或者直接跳转
    await page.goto('/practice');
    
    // 3. 等待题目加载 (验证卡片出现)
    await expect(page.locator('.border.p-6.rounded.shadow-sm.bg-white')).toBeVisible({ timeout: 15000 });

    // 4. 验证题目内容存在
    const questionText = await page.locator('h2').innerText();
    expect(questionText.length).toBeGreaterThan(0);

    // 5. 测试“排除法”交互
    // 找到第一个选项 (现在是 div role="button")
    const firstOption = page.locator('div[role="button"]').first();
    await expect(firstOption).toBeVisible();

    // 右键点击排除
    await firstOption.click({ button: 'right' });
    
    // 验证是否变灰/有中划线 (根据 CSS 类名判断)
    // 我们的代码逻辑：isExcluded ? 'opacity-40 grayscale ...'
    await expect(firstOption).toHaveClass(/opacity-40/);
    await expect(firstOption).toHaveClass(/grayscale/);
    
    // 再次右键取消排除
    await firstOption.click({ button: 'right' });
    await expect(firstOption).not.toHaveClass(/opacity-40/);

    // 6. 正常点击答题
    // 为了稳健性，我们点击第二个选项进行答题，避开刚刚操作过排除法的第一个选项
    const secondOption = page.locator('div[role="button"]').nth(1);
    await expect(secondOption).toBeVisible();
    await secondOption.click();

    // 检查是否是多选题
    const isMulti = await page.getByText('多项选择').isVisible();
    if (isMulti) {
        // 多选题需要点击提交按钮
        await page.getByRole('button', { name: '确认提交' }).click();
    }

    // 7. 验证是否进入下一题 (进度条变化，或者题目内容变化)
    // 验证题目文字变化 (需要等待一点时间)
    await expect(async () => {
        const nextQuestionText = await page.locator('h2').innerText();
        expect(nextQuestionText).not.toEqual(questionText);
    }).toPass({ timeout: 10000 }); // 增加超时时间到 10s
  });
});
