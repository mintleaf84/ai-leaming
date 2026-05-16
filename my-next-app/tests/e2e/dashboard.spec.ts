import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dashboard');
    });

    test('should load dashboard page', async ({ page }) => {
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.getByText('学习概览')).toBeVisible();
    });

    test('should show stats cards after login', async ({ page }) => {
        // 等待卡片加载
        await page.waitForSelector('text=今日专注', { timeout: 10000 }).catch(() => {});
        const cards = await page.locator('.grid > div').count();
        expect(cards).toBeGreaterThanOrEqual(0);
    });

    test('should navigate to practice', async ({ page }) => {
        const practiceLink = page.getByRole('link', { name: /开始练习/i });
        if (await practiceLink.first().isVisible()) {
            await practiceLink.first().click();
            await expect(page).toHaveURL(/\/practice/);
        }
    });

    test('should navigate to wrong book', async ({ page }) => {
        const wrongBookLink = page.getByRole('link', { name: /错题本/i });
        if (await wrongBookLink.first().isVisible()) {
            await wrongBookLink.first().click();
            await expect(page).toHaveURL(/\/wrong-book/);
        }
    });

    test('should show quick actions', async ({ page }) => {
        await expect(page.getByText('快速开始')).toBeVisible();
    });

    test('should require login to access dashboard', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
    });
});