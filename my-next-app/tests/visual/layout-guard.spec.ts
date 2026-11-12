import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../e2e/fixtures";
import { assertLayoutIntact, gotoAndSettle } from "./layout-helpers";

/**
 * 布局护栏用例（不依赖截图基线）
 *
 * 覆盖：/login（公开）+ 9 个登录后主路由 + 3 个管理端路由 × 3 个视口 = 39 条用例，
 * 外加 1 条 /wrong-book「选中题目后」的专项（其底部操作栏是条件渲染的，
 * 默认状态不渲染，重叠断言会空跑）。
 *
 * 每条用例的判定（详见 layout-helpers.ts）：
 *   - 所有视口：HTTP 2xx/3xx、非错误边界、非骨架态、documentElement 无横向溢出、
 *     主容器可见且有真实文本；
 *   - 375 视口额外：main 内部不得横向滚动、无元素越出视口右侧；
 *   - 375 视口额外：不存在两条互相重叠的贴底固定底栏（§6 一个页面最多一条）；
 *   - 375 视口额外（报告模式，不阻断）：可点区域 < 44×44、表单双列。
 *
 * 管理端复用 tests/e2e/fixtures 的 adminPage（testadmin 登录态）；
 * admin 区是独立 layout（admin-layout-shell），侧边栏 md 起常驻，
 * 移动端表格必须已改为卡片，否则 375 视口会报横向溢出。
 */

const VIEWPORTS = [
  { id: "375x812", width: 375, height: 812 },
  { id: "768x1024", width: 768, height: 1024 },
  { id: "1440x900", width: 1440, height: 900 },
] as const;

/** 不需要登录态的路由 */
const PUBLIC_ROUTES = ["/login"] as const;

/** 需要普通用户登录态的路由（复用 tests/e2e/fixtures 的 loggedInPage） */
const AUTH_ROUTES = [
  "/dashboard",
  "/practice",
  "/practice/setup",
  "/wrong-book",
  "/history",
  "/questions/import",
  "/notes",
  "/chat",
  "/knowledge",
] as const;

/**
 * 需要管理员登录态的路由（复用 tests/e2e/fixtures 的 adminPage）。
 * 三条都真实存在：src/app/admin/{page,users/page,plans/page}.tsx。
 */
const ADMIN_ROUTES = ["/admin", "/admin/users", "/admin/plans"] as const;

/**
 * 导航结果的降级信息：networkidle 超时与骨架未清空**不在这里失败**，
 * 但必须留痕 —— 它们正是"采样到加载态"的前兆。
 * 骨架的最终判定在 assertLayoutIntact 里（probe.skeletonsVisible）。
 */
async function visit(
  page: Page,
  route: string,
  viewport: string,
): Promise<void> {
  const nav = await gotoAndSettle(page, route, viewport);
  const where = `路由 ${route} @ ${viewport}`;

  if (!nav.networkIdle) {
    const note = `${where}：10s 内未到达 networkidle（页面可能有 SSE/轮询），已继续采样`;
    test
      .info()
      .annotations.push({ type: "network-idle-timeout", description: note });
    console.warn(note);
  }
  if (!nav.skeletonResolved) {
    const note = `${where}：10s 内骨架未消失，采样时可能仍是加载态`;
    test
      .info()
      .annotations.push({ type: "skeleton-timeout", description: note });
    console.warn(note);
  }
}

/**
 * /admin/users 是「骨架 → 表格/卡片」两段式渲染，采样早了量到的是骨架（护栏会判失败，
 * 但那是假信号）。这里等到行/卡片真正可见再交给 assertLayoutIntact。
 *
 * 「用户列表加载失败」是**硬失败**而不是待观察项：错误态的几何量没有意义，
 * 让它跑到 assertLayoutIntact 只会得到一句"骨架/空壳"的误导信息，
 * 所以在这里直接把 ErrorState 的文案带出来。
 */
async function waitForAdminUsersList(
  page: Page,
  viewport: string,
): Promise<void> {
  const where = `路由 /admin/users @ ${viewport}`;
  // 用页面头部「共 N 位注册用户」作为就绪信号：只有数据加载完成后才渲染。
  // 之前按「表格行/卡片」计数，实测在 CI 上会一直读不到（骨架/挂载时序），
  // 而这个计数行是纯文本，稳定得多。
  // 注意 `共 N 位注册用户` 在加载中就渲染成「共 0 位」，所以必须要求 N > 0；
  // 真的没有用户时走空态分支
  const readyHeader = page.getByText(/共 [1-9]\d* 位注册用户/);
  const errorState = page.getByText("用户列表加载失败");

  await expect
    .poll(
      async () => {
        if ((await errorState.count()) > 0) return "error";
        if ((await readyHeader.count()) > 0) return "ready";
        if ((await page.getByText("没有找到用户").count()) > 0) return "ready";
      },
      {
        timeout: 20_000,
        message: `${where}：没等到「共 N 位注册用户」——仍是加载态，或页面渲染了错误态`,
      },
    )
    .toBe("ready");
}

for (const vp of VIEWPORTS) {
  test.describe(`视口 ${vp.id}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of PUBLIC_ROUTES) {
      test(`公开路由 ${route}`, async ({ page }) => {
        await visit(page, route, vp.id);
        await assertLayoutIntact(page, route, vp.id);
      });
    }

    for (const route of AUTH_ROUTES) {
      // 每条用例独立登录（fixtures.loginAs），保证用例之间互不污染；
      // 代价是每个视口多 9 次登录，CI 上 workers=2 可接受。
      test(`受保护路由 ${route}`, async ({ loggedInPage: page }) => {
        await visit(page, route, vp.id);
        await assertLayoutIntact(page, route, vp.id);
      });
    }

    for (const route of ADMIN_ROUTES) {
      // 管理端用 adminPage fixture（testadmin 登录态），断言逻辑与前台完全一致
      test(`管理端路由 ${route}`, async ({ adminPage: page }) => {
        await visit(page, route, vp.id);
        // 列表页先确认渲染出了真实行/卡片，避免把骨架或错误态当页面来测量
        if (route === "/admin/users") {
          await waitForAdminUsersList(page, vp.id);
        }
        await assertLayoutIntact(page, route, vp.id);
      });
    }

    // 专项：/wrong-book 的页面级固定操作栏是**条件渲染**的（选中题目才出现），
    // 默认状态它不渲染、MobileNav 正常显示，底栏重叠断言等于空跑。
    // 只有 375 视口有重叠风险（移动端才渲染 MobileNav），其他视口不必重复。
    if (vp.width <= 375) {
      test(`受保护路由 /wrong-book（选中题目后）`, async ({
        loggedInPage: page,
      }) => {
        await visit(page, "/wrong-book", vp.id);

        // 选择控件有三种可能：role=checkbox / 原生 checkbox / 顶部的「全选」。
        // 当前 WrongQuestionCard 用的是无 role 的方形图标按钮，所以「全选」是兜底路径。
        const candidates = [
          page.getByRole("checkbox").first(),
          page.locator('input[type="checkbox"]').first(),
          page.getByRole("button", { name: /^全选$/ }).first(),
        ];
        let trigger: (typeof candidates)[number] | null = null;
        for (const candidate of candidates) {
          if ((await candidate.count()) > 0) {
            trigger = candidate;
            break;
          }
        }

        // global-setup 会为 testuser 造一条答错记录，因此这里**必须**能找到选择控件。
        // 找不到就是夹具坏了（而不是"环境不适配"），直接失败，避免这条用例长期静默空跑。
        expect(
          trigger,
          "测试库里没有可选错题：global-setup 应已种入一条 is_correct=0 的 practice_log，" +
            "否则 /wrong-book 是空态、页面级底栏不渲染，重叠断言等于没跑",
        ).not.toBeNull();
        if (trigger === null) return;

        await trigger.click();

        // 操作栏真的出现了再采样（等文本而不是等固定时长）
        await expect(
          page.getByRole("button", { name: /开始练习选中的/ }),
          `路由 /wrong-book @ ${vp.id}：选中题目后底部操作栏没有出现，无法验证底栏重叠`,
        ).toBeVisible();

        await assertLayoutIntact(page, "/wrong-book", vp.id);
      });
    }
  });
}
