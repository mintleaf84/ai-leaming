import { test, expect } from "./fixtures";
import fs from "fs";
import path from "path";

/**
 * 管理端导出功能 E2E 测试
 */
test.describe("管理端导出功能", () => {
  test("应该能够成功导出题目 CSV 文件", async ({ adminPage }) => {
    // 1. 进入题目管理页面
    await adminPage.goto("/admin");
    // 假设默认进入的是 dashboard，需要点击题目管理
    // 根据 QuestionManager 的位置，可能在 /admin/questions
    await adminPage.goto("/admin/questions");

    // 2. 等待题目列表加载
    await expect(adminPage.getByText(/测试题1/).first()).toBeVisible({
      timeout: 10000,
    });

    // 3. 点击导出按钮并等待下载
    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("button", { name: /导出 CSV/i }).click();
    const download = await downloadPromise;

    // 4. 验证下载的文件名和内容
    expect(download.suggestedFilename()).toContain("questions_export");
    expect(download.suggestedFilename()).toContain(".csv");

    const downloadPath = path.join(
      process.cwd(),
      "test-results",
      download.suggestedFilename(),
    );
    await download.saveAs(downloadPath);

    // 5. 检查文件内容是否包含预期的 CSV 头部 (注意：后端返回的是中文头部)
    const content = fs.readFileSync(downloadPath, "utf-8");
    expect(content).toContain("ID,类型,维度,题干,选项,答案,解析,标签");
    expect(content).toContain("测试题1");

    // 清理测试文件
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });

  test("筛选后导出应包含筛选后的内容", async ({ adminPage }) => {
    await adminPage.goto("/admin/questions");

    // 1. 输入筛选条件
    await adminPage.getByPlaceholder(/搜索题干内容/).fill("测试题2");
    await adminPage.getByRole("button", { name: /筛选/i }).click();

    // 2. 验证列表已更新
    await expect(adminPage.getByText("测试题2").first()).toBeVisible();
    await expect(adminPage.getByText("测试题1").first()).not.toBeVisible();

    // 3. 执行导出
    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("button", { name: /导出 CSV/i }).click();
    const download = await downloadPromise;

    const downloadPath = path.join(
      process.cwd(),
      "test-results",
      `filtered_${download.suggestedFilename()}`,
    );
    await download.saveAs(downloadPath);

    const content = fs.readFileSync(downloadPath, "utf-8");
    expect(content).toContain("测试题2");
    expect(content).not.toContain("测试题1");

    // 清理
    fs.unlinkSync(downloadPath);
  });
});
