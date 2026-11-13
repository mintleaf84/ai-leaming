import path from "path";
import Database from "better-sqlite3";

import { test, expect } from "./fixtures";

/**
 * 回忆自测（/recall）端到端用例 —— 覆盖规格 §6 验收 1/2/7：
 *
 * - 验收 2：列举卡完整流程（作答 → 判分 → 确认）≤90 秒，冷启动直接落在作答屏；
 * - 验收 7：重测只呈现上次没想起来的条目（当天不会立刻重测，因此只断言文案）；
 * - 验收 3 的"不一致可一次点击纠正"落地为用户改判（黄 → 绿）。
 *
 * 状态隔离：三张种子卡（`e2e-recall` 卡组，见 global-setup）是全局共享的，
 * 复习进度按用户隔离。每个用例前清一次 testuser 的 `recall_card_states` /
 * `recall_review_logs`，让三条用例都从"新卡首次出现"开始——否则前一条用例复习过的
 * 卡当天不再到期，后一条用例拿到的卡片顺序会跟着变，用例之间就成了隐式依赖
 * （CI 上失败重试时尤其明显：重试拿到的库已经被上一次尝试写过）。
 */

const DB_PATH = path.resolve(process.cwd(), "data", "test-e2e.db");

function resetRecallProgress(username = "testuser") {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  // 服务端（另一个进程）可能正在写：等锁而不是直接抛 SQLITE_BUSY
  db.pragma("busy_timeout = 5000");

  const user = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: number } | undefined;

  if (!user) {
    db.close();
    throw new Error(
      `E2E 前置条件缺失：用户 ${username} 不存在（global-setup 未跑？）`,
    );
  }

  db.prepare("DELETE FROM recall_review_logs WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM recall_card_states WHERE user_id = ?").run(user.id);
  db.close();
}

/** 种子卡（与 global-setup 的 `e2e-recall` 卡组逐字一致） */
const LIST_PROMPT = "E2E：写出水的两种状态";
const LIST_ITEM_OK = "固态";
const LIST_ITEM_MISS = "液态";

test.describe("回忆自测", () => {
  test.beforeEach(() => {
    resetRecallProgress();
  });

  /**
   * 验收 2：冷启动打开 /recall 已经在作答屏（没有任何"开始"按钮），
   * 列举卡「作答 → 看答案 → 确认结果」到进入下一张 ≤90 秒。
   *
   * 全对时不再自动跳转：`nextReviewText`（「下次 X 月 X 日」）是规格 §4.3
   * 要求展示的信息，所以结论块会停留，用户点「下一张」继续。
   */
  test("首次作答：打开即在作答屏，答完展示下次日期并进入下一张（≤90s）", async ({
    loggedInPage: page,
  }) => {
    // 默认 60s 用例上限会把验收 2 的 90s 上限先截断（失败会报 timeout 而不是
    // 一句有意义的"超时 90 秒"），这里单独放宽，让 90s 成为真正的判据
    test.setTimeout(120_000);
    const startedAt = Date.now();

    await page.goto("/recall");

    // 不做任何点击：题干与输入框应已就位
    await expect(page.getByText(LIST_PROMPT).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("textbox")).toBeVisible();
    // 顶部合计：3 张新卡（每卡约 0.4 分钟 → 向上取整 2 分钟）
    await expect(page.getByText(/回忆 3 张/).first()).toBeVisible();

    await page.getByRole("textbox").fill("固态、液态");
    await page.getByRole("button", { name: "看答案" }).click();

    // 判分屏：逐条结果（两条都命中关键词 → 绿）
    await expect(
      page.getByRole("button", { name: new RegExp(LIST_ITEM_OK) }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: new RegExp(LIST_ITEM_MISS) }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "确认结果" }).click();

    // 全对 → 结论块显示「下次 X 月 X 日」（规格 §4.3），再点「下一张」
    await expect(
      page.getByRole("status").filter({ hasText: /下次/ }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /下一张/ }).click();
    await expect(page.getByLabel("第 1 空")).toBeVisible({ timeout: 15000 });

    expect(Date.now() - startedAt).toBeLessThanOrEqual(90_000);
  });

  /** 验收 3 的交互面：判错的条目一次点击即可改正，且不影响正常完成 */
  test("改判：黄色条目点一下变绿并标记「已改判」", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/recall");
    await expect(page.getByText(LIST_PROMPT).first()).toBeVisible({
      timeout: 15000,
    });

    // 只写固态 → 液态那条判黄
    await page.getByRole("textbox").fill(LIST_ITEM_OK);
    await page.getByRole("button", { name: "看答案" }).click();

    const missedItem = page.getByRole("button", {
      name: new RegExp(LIST_ITEM_MISS),
    });
    await expect(missedItem).toHaveAttribute("aria-pressed", "false");

    await missedItem.click();

    // 改判标记挂在被点的那一条上（不是整屏），所以从条目按钮里找
    await expect(missedItem.getByText("已改判")).toBeVisible();
    await expect(missedItem).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "确认结果" }).click();

    // 改判后全对 → 结论块显示「下次」，点「下一张」进入填空卡
    // （能走到"下次"就证明改判真的参与了判分，否则 rating 会是 hard）
    await expect(
      page.getByRole("status").filter({ hasText: /下次/ }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /下一张/ }).click();
    await expect(page.getByLabel("第 1 空")).toBeVisible({ timeout: 15000 });
  });

  /**
   * 验收 7：重测只呈现上次错的那几条。
   *
   * 当天复习过的卡不会立刻到期（最短间隔 1 天），所以这里只断言服务端给出的
   * 结论文案「明天只重测这 1 条」；重测界面的条目裁剪由单测覆盖
   * （src/lib/recall/__tests__ + recall-actions.test.ts）。
   */
  test("部分答对：结论只把错的那条排进明天重测", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/recall");
    await expect(page.getByText(LIST_PROMPT).first()).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("textbox").fill(LIST_ITEM_OK);
    await page.getByRole("button", { name: "看答案" }).click();

    await expect(
      page.getByRole("button", { name: new RegExp(LIST_ITEM_OK) }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: new RegExp(LIST_ITEM_MISS) }),
    ).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "确认结果" }).click();

    // 有错 → 不自动进下一张，结论留在判分屏（rating = hard）。
    // 结论块是 role="status"：用结论文案过滤，避免与全局 toast 的 live region 撞车。
    const outcome = page
      .getByRole("status")
      .filter({ hasText: "明天只重测这 1 条" });
    await expect(outcome).toBeVisible({ timeout: 15000 });
    await expect(outcome).toContainText("没写到的条目明天会单独重测");
    // 停在这一屏，用户可以自己决定什么时候继续
    await expect(page.getByRole("button", { name: /下一张/ })).toBeVisible();
  });
});
