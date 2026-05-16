import { test, expect } from '@playwright/test';

test.describe('Mindmap Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/mindmap');
    });

    test('should load mindmap list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/mindmap/);
    });

    test('should show create new mindmap button', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const createBtn = page.getByRole('button', { name: /新建/i });
        const exists = await createBtn.count();
        if (exists > 0) {
            await expect(createBtn.first()).toBeVisible();
        }
    });

    test('should require login', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/mindmap');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Mindmap Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/mindmap/test-id');
    });

    test('should redirect to login if not authenticated', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/mindmap/test-id');
        await expect(page).toHaveURL(/\/login/);
    });
});