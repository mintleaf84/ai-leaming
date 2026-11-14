import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import type { Locator, Page } from "@playwright/test";

import { test, expect, loginAs } from "./fixtures";

/**
 * 回忆自测：**真实卡组导入**端到端用例 —— 覆盖规格 §6 验收 1 的主路径：
 *
 *   「新用户 → 导入示例卡组 → 答第一张卡」
 *
 * 既有 `recall.spec.ts` 用 SQL 播种 3 张卡，从未走过导入对话框；这里用仓库里
 * 落地的真实卡组副本（104 卡 / 30 组，内容仓产物）走完整导入链路：
 *
 * - A. 导入 → 卡组列表出现 104 张 → `/recall` 不做任何点击就落在作答屏（≤120s）；
 * - B. 同一份文件再导一次：0 新增 / 104 跳过（幂等），已答过的卡不再进今日队列；
 * - C. 改一张卡的 prompt 再导：出现冲突 UI（保留我的 / 采用新文件），
 *      选「保留我的」后库里内容不变，且**再导一次仍然报冲突**（keep 不更新 hash）。
 *
 * ## 为什么用独立用户而不是 testuser
 *
 * `testuser` 的复习进度是**多个 spec 共享**的（`recall.spec.ts` 的 beforeEach 会
 * 整表清掉它的 `recall_card_states`）。E2E 在 CI 上按文件并行（workers=2），
 * 若本 spec 也用 testuser，B 用例"答完的卡不再出现"会被别的 spec 的清理中途打掉，
 * 变成跨文件的隐式依赖。这里建一个专用用户，既隔离了并发，也正好对上验收 #1 的
 * 「新用户」前提。
 *
 * ## 为什么归档共享的 `e2e-recall` 种子卡
 *
 * 队列的新卡按 `recall_cards.id` 升序投放，而种子卡的 id 一定比导入产生的卡小，
 * 不归档的话首张永远是种子卡 —— 「导入后直接答**导入的**卡」就测不到。
 * 归档是**按用户**的（`recall_card_states.archived = 1`），不影响其他 spec。
 *
 * ## 一条隐含前提
 *
 * 队首断言依赖「E2E 库里除 `e2e-recall` 外没有别的回忆卡组」。目前只有
 * `global-setup.ts` 播种回忆卡（`grep recall_cards tests/` 可核实）。若以后有别的
 * spec 也往 `recall_cards` 里塞卡（id 更小就会先于导入的卡投放），这里的队首断言
 * 需要改成按 `deckTitle` 过滤，而不是假设「导入的第一张 = 队首」。
 */

const DB_PATH = path.resolve(process.cwd(), "data", "test-e2e.db");

/** 真实卡组副本（内容仓 `docs/recall/fj-jiaozong-2027.deck.json` 的产物） */
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "src",
  "lib",
  "recall",
  "__tests__",
  "fixtures",
  "fj-jiaozong-2027.deck.json",
);

const DECK_KEY = "fj-jiaozong-2027";
const DECK_TITLE = "福建教综 2027";

/** global-setup 播种的共享卡组（本 spec 只按用户归档，不删） */
const SEED_DECK_KEY = "e2e-recall";

/** 专用测试用户：不与 testuser / testadmin 共享任何复习进度 */
const DECK_USER = { username: "recallimportuser", password: "deck123456" };
/** 模块级算一次：每个用例都重新 bcrypt（cost 10）会白等 100ms */
const DECK_USER_HASH = bcrypt.hashSync(DECK_USER.password, 10);

interface DeckFile {
  deckId: string;
  title: string;
  cards: Array<{ cardId: string; kind: string; prompt: string }>;
}

const DECK = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as DeckFile;
const DECK_CARD_COUNT = DECK.cards.length;
/** 队首 = 文件里第一张卡（新卡按 recall_cards.id 升序 = 导入顺序） */
const FIRST_PROMPT = DECK.cards[0].prompt;
const SECOND_PROMPT = DECK.cards[1].prompt;

if (DECK.deckId !== DECK_KEY) {
  throw new Error(
    `fixture 与用例假设不一致：deckId=${DECK.deckId}，期望 ${DECK_KEY}`,
  );
}
if (DECK_CARD_COUNT !== 104) {
  throw new Error(
    `fixture 卡片数变了（${DECK_CARD_COUNT}，期望 104）：断言里的 104 / 103 需要同步更新`,
  );
}
// 前两张必须是列举卡：列举卡的题干整段渲染，`getByText(题干)` 才能直接命中；
// 填空卡会被 ClozePrompt 拆成「文字 + 空位」，全文匹配不再成立。
for (const card of DECK.cards.slice(0, 2)) {
  if (card.kind !== "list") {
    throw new Error(
      `fixture 前两张卡必须是列举卡（当前 ${card.cardId}=${card.kind}）：队首题干的断言依赖整段渲染`,
    );
  }
}

/** WAL + busy_timeout：服务端进程可能正在写这张库 */
function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

function requireUserId(db: Database.Database, username: string): number {
  const user = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: number } | undefined;
  if (!user) {
    throw new Error(
      `E2E 前置条件缺失：用户 ${username} 不存在（用例的 beforeEach 未跑？）`,
    );
  }
  return user.id;
}

/** 幂等建用户：登录后落到 /dashboard，缺订阅会让该页进错误分支，所以一并补齐 */
function ensureDeckUser(db: Database.Database): number {
  db.prepare(
    `INSERT OR IGNORE INTO users (username, password_hash, role, token_version)
     VALUES (?, ?, 'student', 0)`,
  ).run(DECK_USER.username, DECK_USER_HASH);

  const userId = requireUserId(db, DECK_USER.username);
  db.prepare(
    `INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status)
     VALUES (?, 'free', 'active')`,
  ).run(userId);
  return userId;
}

/**
 * 清掉本用户造的所有数据：
 * 1. 复习进度（按用户）；
 * 2. 导入产生的卡组（`fj-jiaozong-2027`）—— 子表先删，`recall_cards` 有外键引用；
 *    `recall_decks` 本身不删也靠幂等复用，但删干净才能让「新增 104 张」重新成立。
 *
 * 只删本 spec 自己的卡组；`e2e-recall` 是共享种子，绝不能删。
 */
function resetDeckImportState(db: Database.Database, userId: number) {
  db.prepare("DELETE FROM recall_review_logs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM recall_card_states WHERE user_id = ?").run(userId);

  const deck = db
    .prepare("SELECT id FROM recall_decks WHERE deck_key = ?")
    .get(DECK_KEY) as { id: number } | undefined;
  if (!deck) return;

  // 导入的卡可能被任何用户答过（本 spec 只有 DECK_USER，但按卡片删更稳）
  db.prepare(
    `DELETE FROM recall_review_logs
     WHERE card_id IN (SELECT id FROM recall_cards WHERE deck_id = ?)`,
  ).run(deck.id);
  db.prepare(
    `DELETE FROM recall_card_states
     WHERE card_id IN (SELECT id FROM recall_cards WHERE deck_id = ?)`,
  ).run(deck.id);
  db.prepare("DELETE FROM recall_cards WHERE deck_id = ?").run(deck.id);
  db.prepare("DELETE FROM recall_decks WHERE id = ?").run(deck.id);
}

/**
 * 把共享种子卡在本用户名下归档：队列只留导入的卡组。
 *
 * 归档行只是 `recall_card_states.archived = 1`；队列的 fresh 分支要求
 * 「无该用户状态行」，到期分支要求 `archived = 0`，所以归档即彻底排除。
 */
function archiveSeedDeckForUser(db: Database.Database, userId: number) {
  const seedDeck = db
    .prepare("SELECT id FROM recall_decks WHERE deck_key = ?")
    .get(SEED_DECK_KEY) as { id: number } | undefined;
  if (!seedDeck) {
    throw new Error(
      `E2E 前置条件缺失：卡组 ${SEED_DECK_KEY} 不存在（global-setup 未跑？）`,
    );
  }

  const cards = db
    .prepare("SELECT id FROM recall_cards WHERE deck_id = ?")
    .all(seedDeck.id) as Array<{ id: number }>;
  const archive = db.prepare(
    `INSERT OR IGNORE INTO recall_card_states (user_id, card_id, archived)
     VALUES (?, ?, 1)`,
  );
  for (const card of cards) archive.run(userId, card.id);
}

function resetForDeckUser() {
  const db = openDb();
  try {
    const userId = ensureDeckUser(db);
    resetDeckImportState(db, userId);
    archiveSeedDeckForUser(db, userId);
  } finally {
    db.close();
  }
}

/** 打开导入对话框并选好文件（还没点「导入」，方便调用方自己掐表） */
async function startImport(page: Page, filePath: string) {
  // 卡组为空时页面上有两个「导入卡组」（页头 + 空状态），取第一个即可
  await page.getByRole("button", { name: "导入卡组" }).first().click();
  const dialog = page.getByRole("dialog", { name: "导入卡组" });
  await expect(dialog).toBeVisible();

  await dialog.locator('input[type="file"]').setInputFiles(filePath);
  return dialog;
}

/** 点「导入」并等结果（成功态文案由导入对话框给出） */
async function submitImport(dialog: Locator) {
  // exact 匹配：「导入」不能命中「导入卡组」
  await dialog.getByRole("button", { name: "导入", exact: true }).click();
}

/**
 * 完成态「数字账」的断言。
 *
 * 四个数字渲染在同一行（`data-testid="import-summary-counts"`），这里按**标签**
 * 从真实文案里各取一个数，再核对四数之和 = 文件卡数。
 *
 * 为什么不写成 `getByText("新增 0 张 · 更新 0 张 · 跳过 103 张 · 保留 1 张")`：
 * 那样只能证明某一份 fixture 恰好拼出了这串字符，证明不了「每张卡都被交代了」；
 * 而本用例要守的正是**漏账**（keep 的卡曾经既不计新增也不计跳过）。
 */
async function expectImportCounts(
  dialog: Locator,
  expected: { created: number; updated: number; skipped: number; kept: number },
) {
  const counts = dialog.getByTestId("import-summary-counts");
  await expect(counts).toBeVisible({ timeout: 90_000 });

  const text = (await counts.innerText()).replace(/\s+/g, " ").trim();
  const read = (label: string): number => {
    const matched = new RegExp(`${label}\\s*(\\d+)\\s*张`).exec(text);
    if (!matched) throw new Error(`完成态没有「${label} N 张」这一项：${text}`);
    return Number(matched[1]);
  };

  const actual = {
    created: read("新增"),
    updated: read("更新"),
    skipped: read("跳过"),
    // 「保留」只在 N>0 时渲染（下方单独断言），0 张时按 0 计入求和
    kept: expected.kept > 0 ? read("保留") : 0,
  };

  expect(actual, `完成态统计与预期不符：${text}`).toEqual(expected);
  if (expected.kept === 0) {
    expect(text, "保留 0 张时不该多渲染这一项").not.toContain("保留");
  }
  expect(
    actual.created + actual.updated + actual.skipped + actual.kept,
    `新增 + 更新 + 跳过 + 保留 应等于文件卡数 ${DECK_CARD_COUNT}：${text}`,
  ).toBe(DECK_CARD_COUNT);
}

test.describe("回忆卡组导入（真实文件）", () => {
  // 收尾：把导入的 104 卡删掉，别把共享 DB 永久改成 104 卡基线。
  // 注意这不能消除并行时的污染窗口（别的 spec 可能正好与本 spec 同时跑），
  // 所以 recall.spec.ts 的数量断言本身也不锁死张数。
  test.afterAll(() => {
    const db = openDb();
    try {
      resetDeckImportState(db, requireUserId(db, DECK_USER.username));
    } finally {
      db.close();
    }
  });

  test.beforeEach(() => {
    resetForDeckUser();
  });

  /**
   * 验收 #1 主路径：新用户 → 导入真实卡组 → 打开 `/recall` 直接作答。
   *
   * 120s 是**判据**而不是超时余量：产品目标是 15 秒，CI 机器慢，放宽到 120s；
   * 用例总时限再放宽一档（240s），免得超时先于断言发生、报错变成没含义的 timeout。
   */
  test("新用户导入 104 卡 → 打开即在作答屏（≤120s）", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, DECK_USER);

    // 导入前：新用户今天没有任何卡（种子卡已归档）
    await page.goto("/recall");
    await expect(page.getByText("今天没有要回忆的卡").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/recall/decks");
    const dialog = await startImport(page, FIXTURE_PATH);

    const startedAt = Date.now();
    await submitImport(dialog);

    // 导入结果：104 张全部新增，且完成态标明是哪个卡组（导错文件要看得出来）
    await expect(dialog.getByText(`导入完成 · ${DECK_TITLE}`)).toBeVisible({
      timeout: 90_000,
    });
    await expectImportCounts(dialog, {
      created: DECK_CARD_COUNT,
      updated: 0,
      skipped: 0,
      kept: 0,
    });
    await dialog.getByRole("button", { name: "完成" }).click();

    // 卡组列表：标题 + 真实卡数
    const deckNav = page.getByRole("button", { name: new RegExp(DECK_TITLE) });
    await expect(deckNav).toBeVisible({ timeout: 30_000 });
    await expect(deckNav).toContainText(`${DECK_CARD_COUNT} 张`);

    // 跳到「今天」：不做任何点击就已在作答屏
    await page.goto("/recall");
    await expect(page.getByText(FIRST_PROMPT).first()).toBeVisible({
      timeout: 120_000,
    });
    const elapsedMs = Date.now() - startedAt;

    // 答的是导入卡组的卡（卡头显示卡组名），不是 SQL 播种的种子卡
    await expect(page.getByText(DECK_TITLE).first()).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();
    // 顶部合计：104 张新卡按每日额度投放 6 张（默认 newLimit=6）
    await expect(page.getByText(/回忆 6 张/).first()).toBeVisible();

    console.log(`[E2E] 导入 → 题干可见：${elapsedMs} ms`);
    expect(elapsedMs).toBeLessThanOrEqual(120_000);
  });

  /**
   * 幂等 + 进度不动：答完第一张后再导同一份文件 → 0 新增 / 104 跳过，
   * 且已答过的卡不再出现在今天的队列里。
   */
  test("重复导入同一文件：0 新增 104 跳过，已答过的卡不再进队列", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loginAs(page, DECK_USER);

    // 基线：导入一次
    await page.goto("/recall/decks");
    let dialog = await startImport(page, FIXTURE_PATH);
    await submitImport(dialog);
    await expectImportCounts(dialog, {
      created: DECK_CARD_COUNT,
      updated: 0,
      skipped: 0,
      kept: 0,
    });
    await dialog.getByRole("button", { name: "完成" }).click();

    // 答完第一张卡 → 产生 recall_card_states 行
    await page.goto("/recall");
    await expect(page.getByText(FIRST_PROMPT).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("textbox").fill("任务性质、中等强度、倒 U 形");
    await page.getByRole("button", { name: "看答案" }).click();
    await page.getByRole("button", { name: "确认结果" }).click();
    // 提交完成 → 判分屏给出「下一张」（此时状态行已落库）
    await expect(page.getByRole("button", { name: /下一张/ })).toBeVisible({
      timeout: 30_000,
    });

    // 再导同一份文件：全部命中 prompt_hash → 一行都不写
    await page.goto("/recall/decks");
    dialog = await startImport(page, FIXTURE_PATH);
    await submitImport(dialog);
    await expectImportCounts(dialog, {
      created: 0,
      updated: 0,
      skipped: DECK_CARD_COUNT,
      kept: 0,
    });
    await dialog.getByRole("button", { name: "完成" }).click();

    // 今天的队列里不再有它：它是导入顺序里的第一张（id 最小），
    // 若仍在队列里必然是队首；现在队首应该是第二张。
    await page.goto("/recall");
    await expect(page.getByText(SECOND_PROMPT).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(FIRST_PROMPT)).toHaveCount(0);
  });

  /**
   * 内容冲突：同一 cardId、prompt 不同 → 不自动决定，交给人。
   *
   * 关键是「保留我的」**不更新 prompt_hash**（`writeDeck` 的 keep 分支只戳
   * updated_at）。所以：
   * - 选完之后内容仍是旧 prompt（文件里的改动不落库）；
   * - 再导同一份改动文件，冲突**仍然出现**（不会因为上次选过就被静默跳过）。
   */
  test("内容冲突：保留我的不改内容，再导一次仍然报冲突", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, DECK_USER);

    // 基线：干净版本导入成功
    await page.goto("/recall/decks");
    let dialog = await startImport(page, FIXTURE_PATH);
    await submitImport(dialog);
    await expectImportCounts(dialog, {
      created: DECK_CARD_COUNT,
      updated: 0,
      skipped: 0,
      kept: 0,
    });
    await dialog.getByRole("button", { name: "完成" }).click();

    // 只改一张卡的 prompt，写成临时文件（不动仓库里的 fixture）
    const modified = JSON.parse(
      fs.readFileSync(FIXTURE_PATH, "utf8"),
    ) as DeckFile;
    const target = modified.cards[0];
    target.prompt = `${target.prompt}（冲突测试）`;
    const modifiedPath = test.info().outputPath("deck-conflict.json");
    fs.mkdirSync(path.dirname(modifiedPath), { recursive: true });
    fs.writeFileSync(modifiedPath, JSON.stringify(modified, null, 2), "utf8");

    // 第一次冲突：列表给出 cardId，两个按钮都在
    dialog = await startImport(page, modifiedPath);
    await submitImport(dialog);
    await expect(dialog.getByText(/张卡和库里的内容不一样/)).toBeVisible({
      timeout: 90_000,
    });
    await expect(dialog.getByText(/有 1 张卡和库里的内容不一样/)).toBeVisible();
    await expect(
      dialog.getByText(target.cardId, { exact: true }),
    ).toBeVisible();
    const keepButton = dialog.getByRole("button", { name: "保留我的" });
    await expect(keepButton).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "采用新文件" }),
    ).toBeVisible();

    // 选「保留我的」→ 冲突不再挡路，进入完成态：
    // 103 张内容一致被跳过 + 冲突那张「保留 1 张」，四数之和必须回到 104。
    // （keep 只戳 updated_at：不计新增、不计更新、也不计跳过 —— 曾经因此少一张。）
    await keepButton.click();
    await expectImportCounts(dialog, {
      created: 0,
      updated: 0,
      skipped: DECK_CARD_COUNT - 1,
      kept: 1,
    });
    await expect(keepButton).toHaveCount(0);
    await dialog.getByRole("button", { name: "完成" }).click();

    // 卡组内容仍是旧 prompt：看得到原文，看不到「（冲突测试）」
    await page.goto("/recall/decks");
    await page.getByRole("button", { name: new RegExp(DECK_TITLE) }).click();
    await expect(page.getByText(FIRST_PROMPT).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/冲突测试/)).toHaveCount(0);

    // 再导同一份改动文件：keep 没更新 hash，所以冲突必须再次出现
    dialog = await startImport(page, modifiedPath);
    await submitImport(dialog);
    await expect(dialog.getByText(/有 1 张卡和库里的内容不一样/)).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      dialog.getByRole("button", { name: "保留我的" }),
    ).toBeVisible();

    // 收尾：保持"已关闭"状态，别把对话框留给下一条用例
    await dialog.getByRole("button", { name: "保留我的" }).click();
    await dialog.getByRole("button", { name: "完成" }).click();
  });
});
