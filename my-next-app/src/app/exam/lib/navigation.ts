/**
 * "未交卷时离开"的站内导航判定。
 *
 * Next App Router 没有路由守卫钩子，`beforeunload` 只管刷新/关标签页；站内点击
 * 需要自己拦一次（capture 阶段 preventDefault，阻止 Link 走到 pushState）。
 * 判定抽成纯函数，单测不需要 jsdom 的点击派发。
 */

function normalizePath(path: string): string {
  const withoutQuery = path.split("#")[0].split("?")[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

/** 目标路径是否就是当前页（含查询串/锚点变化） */
export function isSameRoute(targetPath: string, currentPath: string): boolean {
  return normalizePath(targetPath) === normalizePath(currentPath);
}

/**
 * 是否拦截这次点击。
 *
 * - 已交卷：不拦（不该再打扰）；
 * - 空链接 / 纯锚点 / 非站内绝对地址：不拦；
 * - 同一路由（换 query 或锚点）：不拦，不算离开页面。
 */
export function shouldInterceptNavigation(
  href: string | null | undefined,
  currentPath: string,
  submitted: boolean,
): boolean {
  if (submitted) return false;
  if (!href || href.startsWith("#")) return false;
  if (!href.startsWith("/") && !/^https?:\/\//.test(href)) return false;
  const targetPath = href.startsWith("/") ? href : new URL(href).pathname;
  return !isSameRoute(targetPath, currentPath);
}
