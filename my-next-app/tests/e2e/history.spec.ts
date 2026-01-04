
import { test, expect } from '@playwright/test';

test.describe('历史记录管理', () => {
  test('应该能查看并删除记录', async ({ page }) => {
    // Step 0: Create a dummy session to ensure history exists
    await page.goto('/practice');
    await expect(page.locator('h2')).toBeVisible({ timeout: 15000 });
    // Answer one question
    await page.locator('div[role="button"]').first().click();
    // Wait for save action
    await page.waitForTimeout(1000);
    
    // Go to history
    await page.goto('/history');

    // Check items
    const historyItems = page.locator('a[href^="/history/"]');
    await expect(historyItems.first()).toBeVisible({ timeout: 10000 });
    const countBefore = await historyItems.count();
    expect(countBefore).toBeGreaterThan(0);

    // 1. Handle Confirm Dialog
    page.on('dialog', dialog => dialog.accept());

    // 2. Click Delete on the first item
    const deleteBtn = page.locator('button[title="删除记录"]').first();
    await deleteBtn.click();

    // 3. Verify Toast
    await expect(page.getByText('记录已成功删除')).toBeVisible();

    // 4. Verify Count Decreased
    await expect(async () => {
        const countAfter = await historyItems.count();
        expect(countAfter).toBe(countBefore - 1);
    }).toPass();
  });
});
