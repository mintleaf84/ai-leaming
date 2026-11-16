"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Web Vitals 上报（docs/performance.md T-01）。
 *
 * 为什么必须有：INP 是"点击不跟手"的唯一官方指标（2024-03 起取代 FID）。
 * 没有它，"优化有没有用"只能靠体感，而体感无法比较两次改动的差异 ——
 * 之前的 P0 清单就是靠推断排的序。
 *
 * 实现取舍：
 *   * `keepalive: true`：离开页面时也要把最后一条发出去（这正是 INP 最需要
 *     的时机），不能用 sendBeacon —— 它固定发 text/plain，服务端 zod 校验会拒。
 *   * 静默失败：指标丢一条，下一屏还会再报；上报失败绝不能弹错或重试，
 *     否则观测代码自己变成性能问题。
 *   * 挂在根 layout 的 body 内，不阻断任何渲染（组件返回 null）。
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: window.location.pathname,
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
