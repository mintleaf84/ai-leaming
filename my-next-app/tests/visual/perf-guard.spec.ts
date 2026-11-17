import { expect } from "@playwright/test";
import { test } from "../e2e/fixtures";

/**
 * 交互性能护栏（docs/performance.md T-09）
 *
 * 与 layout-guard 的分工：那边量「几何是否正确」（有没有溢出、有没有重叠），
 * 这边量「点击/滚动之后主线程有没有被堵住」。两者都用真实生产服务。
 *
 * 为什么用 LoAF 而不是 FPS 或 TBT：
 *   * `long-animation-frame`（Chrome 123+）精确对应"动画/交互帧超过 200ms"，
 *     也就是用户能感知到的"卡一下"，比 TBT 更贴近体感，比自算 rAF 间隔更稳；
 *   * INP 只能靠真实用户数据（T-01 已埋），实验室里用 LoAF 做回归代理。
 *
 * 阈值策略：先按 300ms 观察两周再收到 200ms —— CI 机器抖动确实会造成假红，
 * 但**不允许用 retries 或 test.fixme 掩盖**，红了要看是真阻塞还是环境噪声。
 */
const ROUTES = ["/dashboard", "/wrong-book", "/recall"] as const;
const LOAF_BUDGET_MS = 300;
const INTERACTION_BUDGET_MS = 300;
const SAMPLE_WINDOW_MS = 3000;

/** 在页面里登记 LoAF 与 Event Timing 观察器（必须在导航前注入） */
const INIT_SCRIPT = `
  window.__perfGuard = { loaf: [], events: [], unsupported: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perfGuard.loaf.push({ startTime: Math.round(e.startTime), duration: Math.round(e.duration) });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch (e) {
    window.__perfGuard.unsupported.push("long-animation-frame");
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perfGuard.events.push({ name: e.name, duration: Math.round(e.duration) });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch (e) {
    window.__perfGuard.unsupported.push("event");
  }
`;

type PerfSample = {
  loaf: Array<{ startTime: number; duration: number }>;
  events: Array<{ name: string; duration: number }>;
  unsupported: string[];
};

test.describe("交互性能护栏（LoAF / Event Timing）", () => {
  for (const route of ROUTES) {
    test(`${route} 首屏后 ${SAMPLE_WINDOW_MS}ms 内无 > ${LOAF_BUDGET_MS}ms 的长动画帧`, async ({
      loggedInPage,
    }) => {
      await loggedInPage.addInitScript(INIT_SCRIPT);
      const response = await loggedInPage.goto(route);
      expect(response?.status(), `${route} 应返回 2xx`).toBeLessThan(400);

      // 采样窗口：等首屏稳定后再观察，避免把构建产物下载算进动画帧
      await loggedInPage.waitForLoadState("load");
      await loggedInPage.waitForTimeout(SAMPLE_WINDOW_MS);

      const sample = (await loggedInPage.evaluate(
        () => (window as unknown as { __perfGuard: PerfSample }).__perfGuard,
      )) as PerfSample;

      await test.info().attach(`perf-${route.replace(/\//g, "_")}.json`, {
        body: JSON.stringify(sample, null, 2),
        contentType: "application/json",
      });

      if (sample.unsupported.includes("long-animation-frame")) {
        test.skip(true, "当前 Chromium 不支持 long-animation-frame（需 123+）");
      }

      const worst = sample.loaf.reduce(
        (max, e) => (e.duration > max.duration ? e : max),
        { startTime: 0, duration: 0 },
      );
      expect(
        worst.duration,
        `${route} 出现 ${worst.duration}ms 长动画帧（起点 ${worst.startTime}ms，预算 ${LOAF_BUDGET_MS}ms）。` +
          `排查顺序：template.tsx 整页 spring / 列表项 layoutId / backdrop-blur 叠滚动容器 / 同步大计算。`,
      ).toBeLessThanOrEqual(LOAF_BUDGET_MS);
    });
  }

  test("点击导航后的事件处理时长在预算内", async ({ loggedInPage }) => {
    await loggedInPage.addInitScript(INIT_SCRIPT);
    await loggedInPage.goto("/dashboard");
    await loggedInPage.waitForLoadState("load");
    await loggedInPage.waitForTimeout(500);

    // 清空首屏产生的事件，只量这一次点击之后
    await loggedInPage.evaluate(() => {
      (window as unknown as { __perfGuard: PerfSample }).__perfGuard.events =
        [];
    });

    await loggedInPage.click('a[href="/wrong-book"]');
    await loggedInPage.waitForLoadState("load");
    await loggedInPage.waitForTimeout(SAMPLE_WINDOW_MS);

    const sample = (await loggedInPage.evaluate(
      () => (window as unknown as { __perfGuard: PerfSample }).__perfGuard,
    )) as PerfSample;

    if (sample.unsupported.includes("event")) {
      test.skip(true, "当前 Chromium 不支持 event timing 观察");
    }
    if (sample.events.length === 0) {
      test.skip(
        true,
        "本次点击未产生 ≥16ms 的 event timing 条目（无交互延迟可量）",
      );
    }

    const worst = sample.events.reduce(
      (max, e) => (e.duration > max.duration ? e : max),
      { name: "", duration: 0 },
    );
    expect(
      worst.duration,
      `点击后最长事件处理 ${worst.duration}ms（${worst.name}，预算 ${INTERACTION_BUDGET_MS}ms）`,
    ).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
  });
});
