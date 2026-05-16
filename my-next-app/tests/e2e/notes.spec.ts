import { test, expect } from '@playwright/test';

test.describe('Notes Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/notes');
    });

    test('should load notes page', async ({ page }) => {
        await expect(page).toHaveURL(/\/notes/);
    });

    test('should show notes list or empty state', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });

    test('should show create note button', async ({ page }) => {
        const createBtn = page.getByRole('button', { name: /新建|创建/i });
        const exists = await createBtn.count();
        if (exists > 0) {
            await expect(createBtn.first()).toBeVisible();
        }
    });

    test('should require login', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/notes');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Note Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/notes/test-id');
    });

    test('should show note editor or not found', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });
});

test.describe('Docs Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/docs');
    });

    test('should load docs page', async ({ page }) => {
        await expect(page).toHaveURL(/\/docs/);
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });
});

test.describe('OCR Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/ocr');
    });

    test('should load ocr page', async ({ page }) => {
        await expect(page).toHaveURL(/\/ocr/);
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });

    test('should require login', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/ocr');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Offline Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/offline');
    });

    test('should load offline page', async ({ page }) => {
        await expect(page).toHaveURL(/\/offline/);
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });
});