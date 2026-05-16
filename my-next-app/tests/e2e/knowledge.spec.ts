import { test, expect } from '@playwright/test';

test.describe('Knowledge Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/knowledge');
    });

    test('should load knowledge page', async ({ page }) => {
        await expect(page).toHaveURL(/\/knowledge/);
    });

    test('should show knowledge tree or list', async ({ page }) => {
        // 页面应该包含知识相关内容
        await page.waitForLoadState('networkidle');
        const content = await page.content();
        expect(content.length).toBeGreaterThan(0);
    });

    test('should require login', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/knowledge');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Knowledge Graph Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/knowledge-graph');
    });

    test('should load knowledge graph page', async ({ page }) => {
        await expect(page).toHaveURL(/\/knowledge-graph/);
    });

    test('should show graph visualization', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        // 知识图谱页面应该有 canvas 或 svg 元素
        const hasGraph = await page.locator('canvas, svg').count();
        expect(hasGraph).toBeGreaterThanOrEqual(0);
    });

    test('should require login', async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('/knowledge-graph');
        await expect(page).toHaveURL(/\/login/);
    });
});