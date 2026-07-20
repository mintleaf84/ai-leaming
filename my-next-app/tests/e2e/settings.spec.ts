import { test, expect } from "@playwright/test";
import { TEST_USER } from "./fixtures";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("should load settings page", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText("AI 偏好")).toBeVisible();
  });

  test("should switch between tabs", async ({ page }) => {
    // 默认 AI 偏好 tab
    await expect(page.getByText("AI 偏好")).toBeVisible();

    // 切换到个人资料
    await page.getByText("个人资料").click();
    await expect(page.getByText("用户名")).toBeVisible();

    // 切换到界面外观
    await page.getByText("界面外观").click();
    await expect(page.getByText("深色模式")).toBeVisible();

    // 切换到数据管理
    await page.getByText("数据管理").click();
    await expect(page.getByText("导出数据")).toBeVisible();
  });

  test("should toggle theme", async ({ page }) => {
    await page.getByText("界面外观").click();

    const darkToggle = page.getByRole("switch", { name: /深色模式/i });
    await expect(darkToggle).toBeVisible();

    // 点击切换主题
    await darkToggle.click();
  });

  test("should show data management section", async ({ page }) => {
    await page.getByText("数据管理").click();

    await expect(page.getByText("导出数据")).toBeVisible();
    await expect(page.getByText("重置学习数据")).toBeVisible();
  });

  test("should require login to access settings", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});
