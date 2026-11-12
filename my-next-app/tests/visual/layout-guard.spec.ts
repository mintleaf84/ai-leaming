import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../e2e/fixtures";
import { assertLayoutIntact, gotoAndSettle } from "./layout-helpers";

/**
 * 布局护栏用例（不依赖截图基线）
 *
 * 覆盖：/login（公开）+ 9 个登录后主路由 × 3 个视口 = 30 条用例，
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
 * /admin 暂未覆盖：管理员登录走 adminPage fixture，需要额外一轮全局 setup，
 * 且 admin 区是独立 layout（admin-layout-shell 自带 overflow-x-hidden），
 * 首轮先观察主链路，避免上线即被存量问题淹没。
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
