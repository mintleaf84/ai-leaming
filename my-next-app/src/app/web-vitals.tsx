"use client";

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

/**
 * 前端性能采集（docs/performance.md T-01 / P2-02）。
 *
 * 采三类数据，全部走同一个 `POST /api/vitals`：
 *
 *   vital  — INP / LCP / CLS / TTFB / FCP（`useReportWebVitals`）
 *   launch — 首屏可交互时间：`domInteractive - startTime`
 *            （"用户什么时候能点"，比 load 更贴近体感）
 *   nav    — 单次交互耗时：Event Timing 的 `duration`（按下 → 下一帧）
 *            （`perf-guard` 在 CI 里测的是同一个东西，这里是现场版本）
 *
 * ## 归属口径（重要）
 *
 * Core Web Vitals 都是**按页面加载周期**计算的，客户端导航不会重置它们：
 * 从 `/dashboard` 切到 `/knowledge` 之后，INP/CLS 仍在累计同一次加载里的数据。
 * 如果在回调里读 `location.pathname`，同一条指标就会被记成"当前路由"，
 * 导致按路由的 p75 失真（把跨路由的累计算到最后一个路由头上）。
 *
 * 因此这里在组件挂载时冻结**首个路由**，整次加载的 vital 指标都归给它：
 *   * TTFB / FCP / LCP 天然属于首屏路由，口径准确；
 *   * INP / CLS 是"这次加载期间的累计"，归属首屏路由是当前唯一可解释的选择。
 *
 * nav 的归属不同：它记录"在哪一页点的"，所以用触发时的 pathname；
 * `fromRoute` 记上一次交互所在的路由，用来还原 A→B 的链路。
 *
 * ## 实现取舍
 *
 *   * `keepalive: true`：离开页面时也要把最后一条发出去（这正是 INP 最需要
 *     的时机），不能用 sendBeacon —— 它固定发 text/plain，服务端 zod 校验会拒。
 *   * 静默失败：指标丢一条，下一屏还会再报；上报失败绝不能弹错或重试。
 *   * nav 采样有三重上限（≥40ms 阈值、单页 30 条、服务端 120 次/分/IP），
 *     避免观测代码自己变成性能问题。
 */

type SampleKind = "vital" | "launch" | "nav";

interface VitalSample {
  kind: SampleKind;
  name: string;
  value: number;
  route: string;
  rating?: string;
  fromRoute?: string;
}

/** 单页最多上报多少条 nav 样本 */
const MAX_NAV_SAMPLES = 30;
/** 低于这个时长的交互不值得记（Event Timing 的最小可观测粒度附近） */
const NAV_MIN_MS = 40;

function send(sample: VitalSample) {
  void fetch("/api/vitals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sample),
    keepalive: true,
  }).catch(() => {
    // 观测数据上报失败可忽略：不重试、不提示、不影响业务（见文件头注释）
  });
}

export function WebVitalsReporter() {
  // 只取一次：组件常驻，后续客户端导航不应改变 vital 的归属
  const initialRoute = useRef(
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const launchSent = useRef(false);
  const navCount = useRef(0);
  const lastRoute = useRef<string | null>(null);

  useReportWebVitals((metric) => {
    send({
      kind: "vital",
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: initialRoute.current,
    });
  });

  // ── launch：首屏可交互时间，每次页面加载只报一条
  useEffect(() => {
    if (launchSent.current) return;
    launchSent.current = true;

    const report = () => {
      const [nav] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      if (!nav) return;
      // domInteractive：DOM 解析完成、可响应脚本与点击的时刻
      const value = Math.round(nav.domInteractive - nav.startTime);
      if (Number.isFinite(value) && value > 0) {
        send({
          kind: "launch",
          name: "launch",
          value,
          route: initialRoute.current,
        });
      }
    };

    // 已 complete 可直接取；否则等 load 之后再取，避免读到 0
    if (document.readyState === "complete") report();
    else window.addEventListener("load", report, { once: true });
  }, []);

  // ── nav：Event Timing（Chrome 系支持；不支持就静默跳过）
  useEffect(() => {
    // 用能力探测代替 try/catch：不支持时直接不装观察器，
    // 既不吞异常（会被 catch 审计拦），也让"没数据"的原因可读。
    const supportsEventTiming =
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes("event");
    if (!supportsEventTiming) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (navCount.current >= MAX_NAV_SAMPLES) break;
        const duration = Math.round(entry.duration);
        if (!Number.isFinite(duration) || duration < NAV_MIN_MS) continue;

        const route = window.location.pathname;
        send({
          kind: "nav",
          name: "nav",
          value: duration,
          route,
          fromRoute: lastRoute.current ?? route,
        });
        lastRoute.current = route;
        navCount.current += 1;
      }
    });

    // durationThreshold 是 Event Timing 的扩展字段，TS 的 lib.dom 还没收录，
    // 所以先落到变量再断言（字面量直传会触发 excess property 检查）
    const init = {
      type: "event",
      buffered: true,
      durationThreshold: NAV_MIN_MS,
    };
    observer.observe(init as PerformanceObserverInit);

    return () => observer.disconnect();
  }, []);

  return null;
}
