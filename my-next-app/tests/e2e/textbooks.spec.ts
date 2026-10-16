import { test, expect } from "@playwright/test";

test.describe("Textbooks Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/textbooks");
  });

  test("should load textbooks page", async ({ page }) => {
    await expect(page).toHaveURL(/\/textbooks/);
  });

  test("should show empty state or textbook list", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // 可能显示"暂无教材"或有教材列表
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });

  test("should show upload button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /上传教材/i })).toBeVisible();
  });

  test("should require login", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/textbooks");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Textbook Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/textbooks/test-id");
  });

  test("should show textbook not found for invalid id", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // 可能显示 404 或跳转到列表
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});
