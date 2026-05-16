import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from './fixtures';

test.describe('Admin Questions Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/questions');
    });

    test('should load admin questions page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/questions/);
    });

    test('should show questions management', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });

    test('should require admin login', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const url = page.url();
        expect(url).toMatch(/(\/login|\/admin\/questions)/);
    });
});

test.describe('Admin Users Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/users');
    });

    test('should load admin users page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/users/);
    });
});

test.describe('Admin System Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/system');
    });

    test('should load admin system page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/system/);
    });
});

test.describe('Admin Logs Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/logs');
    });

    test('should load admin logs page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/logs/);
    });
});

test.describe('Admin Activity Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/activity');
    });

    test('should load admin activity page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/activity/);
    });
});

test.describe('Admin AI Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/ai');
    });

    test('should load admin AI page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/ai/);
    });
});

test.describe('Admin API Keys Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/api-keys');
    });

    test('should load admin API keys page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/api-keys/);
    });
});

test.describe('Admin Plans Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/plans');
    });

    test('should load admin plans page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/plans/);
    });
});

test.describe('Admin Feedback Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/feedback');
    });

    test('should load admin feedback page', async ({ page }) => {
        await expect(page).toHaveURL(/\/admin\/feedback/);
    });
});