"use client";

import { useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Web Vitals 上报（docs/performance.md T-01）。
 *
 * 为什么必须有：INP 是"点击不跟手"的唯一官方指标（2024-03 起取代 FID）。
 * 没有它，"优化有没有用"只能靠体感，而体感无法比较两次改动的差异 ——
 * 之前的 P0 清单就是靠推断排的序。
 *
 * ## 归属口径（重要）
 *
 * 所有指标都是**按页面加载周期**计算的，客户端导航不会重置它们：
 * 从 `/dashboard` 切到 `/knowledge` 之后，INP/CLS 仍在累计同一次加载里的数据。
 * 如果在回调里读 `location.pathname`，同一条指标就会被记成"当前路由"，
 * 导致按路由的 p75 失真（把跨路由的累计算到最后一个路由头上）。
 *
 * 因此这里在组件挂载时就冻结**首个路由**，整次页面加载的所有指标都归给它：
 *   * TTFB / FCP / LCP 天然属于首屏路由，口径准确；
 *   * INP / CLS 是"这次加载期间的累计"，归属首屏路由是当前唯一可解释的选择，
 *     文档里也按这个口径写（不要把 route 当成"指标发生地"）。
 *
 * ## 实现取舍
 *
 *   * `keepalive: true`：离开页面时也要把最后一条发出去（这正是 INP 最需要
 *     的时机），不能用 sendBeacon —— 它固定发 text/plain，服务端 zod 校验会拒。
 *   * 静默失败：指标丢一条，下一屏还会再报；上报失败绝不能弹错或重试，
 *     否则观测代码自己变成性能问题。
 *   * 挂在根 layout 的 body 内，不阻断任何渲染（组件返回 null）。
 */
export function WebVitalsReporter() {
  // 只取一次：组件常驻，后续客户端导航不应改变归属
  const initialRoute = useRef(
    typeof window === "undefined" ? "/" : window.location.pathname,
  );

  useReportWebVitals((metric) => {
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: initialRoute.current,
    });

    void fetch("/api/vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 观测数据上报失败可忽略：不重试、不提示、不影响业务（见文件头注释）
    });
  });

  return null;
}
