import type { Page } from "@playwright/test";
import { test } from "../e2e/fixtures";
import { assertLayoutIntact, gotoAndSettle } from "./layout-helpers";

/**
 * 布局护栏用例（不依赖截图基线）
 *
 * 覆盖：/login（公开）+ 8 个登录后主路由 × 3 个视口 = 27 条用例。
 *
 * 每条用例的判定（详见 layout-helpers.ts）：
 *   - 所有视口：HTTP 2xx/3xx、非错误边界、非骨架态、documentElement 无横向溢出、
 *     主容器可见且有真实文本；
 *   - 375 视口额外：main 内部不得横向滚动、无元素越出视口右侧；
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
      // 代价是每个视口多 8 次登录，CI 上 workers=2 可接受。
      test(`受保护路由 ${route}`, async ({ loggedInPage: page }) => {
        await visit(page, route, vp.id);
        await assertLayoutIntact(page, route, vp.id);
      });
    }
  });
}
