import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../e2e/fixtures";
import {
  assertLayoutIntact,
  gotoAndSettle,
  SKELETON_SELECTOR,
} from "./layout-helpers";

/**
 * 布局护栏用例（不依赖截图基线）
 *
 * 覆盖：/login（公开）+ 14 个登录后主路由 + 5 个管理端路由 × 3 个视口 = 60 条用例，
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
 *
 * 客户端取数的路由（/profile、/settings、/dashboard/srs）在采样前必须等一个
 * 内容信号（见 waitFor* 系列）：它们的首屏是转圈/空 div/Suspense fallback，
 * 直接采样量到的不是布局。
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
  // 回忆自测：页面与 P3 的服务端接线同期交付。首屏没有卡片时页面必须给空态
  // （不能停在骨架），否则护栏会判「骨架未消失」。页面就绪后本行自动生效。
  "/recall",
  "/wrong-book",
  "/history",
  "/questions/import",
  "/notes",
  "/chat",
  "/knowledge",
  // 卡组管理：导入对话框、建卡/改卡都在这里，是上一轮新功能里唯一没进护栏的页面。
  // 首屏是卡组列表（空库要落空态，不能停在骨架）—— 就绪判据见 waitForRecallDecks。
  "/recall/decks",
  // 下面三条是「客户端取数」页面：首屏要么是 Loader2（/profile 甚至**没有文本**），
  // 要么是 Suspense fallback（/dashboard/srs 的 fallback 用 animate-pulse，
  // 不在骨架词表里）。不等内容信号就采样，量到的是加载态，护栏会随机红/假绿。
  "/profile",
  "/settings",
  "/dashboard/srs",
] as const;

/**
 * 需要管理员登录态的路由（复用 tests/e2e/fixtures 的 adminPage）。
 * 五条都真实存在：src/app/admin/{page,users/page,plans/page,questions/page,ai/page}.tsx。
 */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/plans",
  "/admin/questions",
  "/admin/ai",
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

/**
 * 通用就绪判据：可见骨架清零。
 *
 * /admin/questions 与 /admin/ai 在 CI 空库下可能直接是空态（没有行可数），
 * 所以不能套用 /admin/users 那种「共 N 位注册用户」的内容信号 —— 那会把
 * 空态页判成"永远没就绪"。骨架消失即代表 Skeleton → 真实内容/空态 已完成切换，
 * 与具体页面内容解耦；采样时若仍有骨架，assertLayoutIntact 还会再兜一次。
 */
async function waitForNoSkeleton(
  page: Page,
  route: string,
  viewport: string,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (selector) =>
            Array.from(document.querySelectorAll(selector)).filter((el) => {
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return false;
              const cs = getComputedStyle(el);
              return cs.display !== "none" && cs.visibility !== "hidden";
            }).length,
          SKELETON_SELECTOR,
        ),
      {
        timeout: 15_000,
        message: `路由 ${route} @ ${viewport}：15s 内仍有可见骨架，此刻采样的会是加载态`,
      },
    )
    .toBe(0);
}

/**
 * /admin/questions 的就绪判据（三选一，任一成立即就绪）：
 *   1. `admin-questions-table` 里有可见行；
 *   2. `admin-questions-cards` 下有可见卡片；
 *   3. 页面出现「没有找到符合条件的题目」空态。
 *
 * 只等「骨架消失」不够：加载结束后停在错误态/空态也一样没有骨架，
 * 那样断言测的是错误页。这里把三态写清楚，并对错误态直接失败、带出文案。
 */
async function waitForAdminQuestionsList(
  page: Page,
  viewport: string,
): Promise<void> {
  const where = `路由 /admin/questions @ ${viewport}`;
  const items = page.locator(
    '[data-testid="admin-questions-table"] tbody tr, [data-testid="admin-questions-cards"] > li',
  );
  const emptyState = page.getByText("没有找到符合条件的题目");
  const errorState = page.getByText("题目列表加载失败");

  await expect
    .poll(
      async () => {
        if ((await errorState.count()) > 0) {
          const text = await errorState
            .first()
            .innerText()
            .catch(() => "题目列表加载失败");
          return `error: ${text}`;
        }
        // 另一套投影是 display:none，rect 高度为 0，只数可见的
        const visibleItems = await items
          .evaluateAll(
            (els) =>
              els.filter((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return false;
                const cs = getComputedStyle(el);
                return cs.display !== "none" && cs.visibility !== "hidden";
              }).length,
          )
          .catch(() => 0);
        if (visibleItems > 0) return "ready";
        if ((await emptyState.count()) > 0) return "ready";
        return "pending";
      },
      {
        timeout: 20_000,
        message:
          `${where}：没等到表格行/卡片，也没等到空态（仍是加载态），` +
          `或页面渲染了「题目列表加载失败」错误态`,
      },
    )
    .toBe("ready");
}

/**
 * /admin/ai 的「模型路由」在第二个标签页里，默认标签是「服务商配置」。
 * 切过去之后等 RouteManager 的两套投影之一真正挂载（加载完才渲染，loading 期是骨架）。
 */
async function waitForAiRoutesPanel(
  page: Page,
  viewport: string,
): Promise<void> {
  const region = page.locator(
    '[data-testid="admin-ai-routes-table"], [data-testid="admin-ai-routes-cards"]',
  );

  await expect
    .poll(
      async () =>
        region.evaluateAll(
          (els) =>
            els.filter((el) => el.getBoundingClientRect().height > 0).length,
        ),
      {
        timeout: 15_000,
        message: `路由 /admin/ai（模型路由标签）@ ${viewport}：没等到表格或卡片挂载 —— 仍是加载态，或标签切换没生效`,
      },
    )
    .toBeGreaterThan(0);
}

/**
 * `/recall/decks` 的就绪判据：页头 `<h1>回忆卡组</h1>`。
 *
 * 它是服务端渲染的（列表数据在 page.tsx 里读），所以正常情况下首帧就有；
 * 这条等待的意义在于**把「停在骨架/白屏」变成一条有明确文案的失败**，
 * 而不是让 assertLayoutIntact 去猜。空库时页面必须落 EmptyState（「还没有卡组」），
 * 两者都会让 h1 先出现，所以等待条件与「有没有卡组」解耦。
 */
async function waitForRecallDecks(page: Page, viewport: string): Promise<void> {
  // exact 必须开：选中卡组的标题 `<h2>E2E 回忆卡组</h2>` 里含「回忆卡组」子串，
  // 不用 exact 会同时命中两条 heading，strict mode 直接报"resolved to 2 elements"。
  await expect(
    page.getByRole("heading", { name: "回忆卡组", exact: true }),
    `路由 /recall/decks @ ${viewport}：没等到页头「回忆卡组」—— 页面疑似停在骨架/白屏，` +
      `或列表渲染抛错后只剩错误边界`,
  ).toBeVisible();
}

/**
 * `/profile` 的就绪判据：「学习成就」卡片（只有 profile 取数成功才渲染）。
 *
 * 这条是**必需**的，不是保险：loading 分支渲染的是
 * `<Loader2 />` + 空 div，`<main>` 的 innerText 为**空字符串**，
 * 采样早一步就会命中「主容器内没有可见文本」—— 那次失败量的是加载态，不是布局。
 */
async function waitForProfile(page: Page, viewport: string): Promise<void> {
  const where = `路由 /profile @ ${viewport}`;
  const ready = page.getByText("学习成就", { exact: true });
  const errorState = page.getByText("个人信息加载失败");
  const emptyState = page.getByText("无法加载个人信息");

  await expect
    .poll(
      async () => {
        if ((await errorState.count()) > 0) {
          const text = await errorState
            .first()
            .innerText()
            .catch(() => "个人信息加载失败");
          return `error: ${text}`;
        }
        if ((await emptyState.count()) > 0) return "error: 无法加载个人信息";
        if ((await ready.count()) > 0) return "ready";
        return "loading";
      },
      {
        timeout: 20_000,
        message:
          `${where}：没等到「学习成就」卡片 —— 仍是 Loader2 加载态，` +
          `或 getUserProfileAction 失败（错误态/无数据态都不是可测的真实布局）`,
      },
    )
    .toBe("ready");
}

/**
 * `/settings` 的就绪判据：侧栏 `<h1>设置与偏好</h1>`。
 *
 * `settings` 为 null 时整页只有「正在加载配置...」的转圈占位（有文本，
 * 所以 assertLayoutIntact 不会失败 —— 那正是问题：它会**假绿**地量一个空壳）。
 */
async function waitForSettings(page: Page, viewport: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (await page.getByRole("heading", { name: "设置与偏好" }).count()) > 0,
      {
        timeout: 20_000,
        message:
          `路由 /settings @ ${viewport}：没等到「设置与偏好」—— 仍是` +
          `「正在加载配置...」转圈态，或 getSettingsAction 没返回数据`,
      },
    )
    .toBe(true);
}

/**
 * `/dashboard/srs` 的就绪判据：「记忆状态分布」卡片。
 *
 * 它的 Suspense fallback 用 `animate-pulse`（刻意不在骨架词表里，因为该 class
 * 也被合法用途使用），所以骨架断言抓不到它；服务端取数失败时页面会渲染
 * 一句「加载失败」—— 那句话有文本、能过关，但测的其实是错误页。
 */
async function waitForSrsAnalysis(page: Page, viewport: string): Promise<void> {
  const where = `路由 /dashboard/srs @ ${viewport}`;
  const ready = page.getByText("记忆状态分布");
  const errorState = page.getByText("加载失败", { exact: true });

  await expect
    .poll(
      async () => {
        if ((await errorState.count()) > 0) return "error: 加载失败";
        if ((await ready.count()) > 0) return "ready";
        return "loading";
      },
      {
        timeout: 20_000,
        message:
          `${where}：没等到「记忆状态分布」图表卡片 —— 仍在 Suspense fallback` +
          `（正在深度分析记忆数据...），或 getSrsGlobalStatsAction 返回了空数据`,
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
      // 代价是每个视口 14 次登录，CI 上 workers=2 可接受。
      test(`受保护路由 ${route}`, async ({ loggedInPage: page }) => {
        await visit(page, route, vp.id);
        // 客户端取数的页面必须先等到真实内容再采样（各函数头部写了为什么）
        if (route === "/recall/decks") {
          await waitForRecallDecks(page, vp.id);
        } else if (route === "/profile") {
          await waitForProfile(page, vp.id);
        } else if (route === "/settings") {
          await waitForSettings(page, vp.id);
        } else if (route === "/dashboard/srs") {
          await waitForSrsAnalysis(page, vp.id);
        }
        await assertLayoutIntact(page, route, vp.id);
      });
    }

    for (const route of ADMIN_ROUTES) {
      // 管理端用 adminPage fixture（testadmin 登录态），断言逻辑与前台完全一致
      test(`管理端路由 ${route}`, async ({ adminPage: page }) => {
        await visit(page, route, vp.id);
        if (route === "/admin/users") {
          // 列表页先确认渲染出了真实行/卡片，避免把骨架或错误态当页面来测量
          await waitForAdminUsersList(page, vp.id);
        } else {
          // 题目/路由两页可能是空态，用与内容无关的「骨架消失」判据
          await waitForNoSkeleton(page, route, vp.id);
          if (route === "/admin/questions") {
            // 骨架消失也可能是停在错误态：再确认三态里的「行/卡片/空态」之一
            await waitForAdminQuestionsList(page, vp.id);
          }
        }
        await assertLayoutIntact(page, route, vp.id);

        // /admin/ai 默认停在「服务商配置」标签，模型路由表在第二个标签里：
        // 不切过去就永远测不到那张表的双投影，等于护栏空跑
        if (route === "/admin/ai") {
          await page.getByRole("button", { name: /模型路由/ }).click();
          await waitForAiRoutesPanel(page, vp.id);
          await waitForNoSkeleton(page, `${route}（模型路由标签）`, vp.id);
          // 路径没变，仍传 /admin/ai：assertLayoutIntact 会校验 pathname 与路由一致
          await assertLayoutIntact(page, route, vp.id);
        }
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
