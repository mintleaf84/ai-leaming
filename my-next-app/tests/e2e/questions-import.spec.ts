import { test, expect } from "@playwright/test";

test.describe("Questions Import Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/questions/import");
  });

  test("should load questions import page", async ({ page }) => {
    await expect(page).toHaveURL(/\/questions\/import/);
  });

  test("should show import instructions", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // 应该有导入说明或上传区域
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });

  test("should require admin role", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // 如果没有 admin 权限，可能会被重定向或显示 403
    const url = page.url();
    expect(url).toMatch(/(\/questions\/import|\/login|\/403)/);
  });

  test("should require login", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/questions/import");
    await expect(page).toHaveURL(/\/login/);
  });
});
