"use client";

import { useEffect, useRef } from "react";
import { shouldInterceptNavigation } from "../lib/navigation";

interface UnsavedGuardOptions {
  /** 是否还在作答（已交卷/加载中时为 false，不打扰） */
  active: boolean;
  /** 拦截到一次站内跳转：由页面弹确认框，用户确认后再 `router.push` */
  onBlocked: (href: string) => void;
}

/**
 * 未交卷离开防护。
 *
 * 两件事：
 * 1. `beforeunload`：刷新 / 关标签页 / 地址栏跳走 —— 走浏览器原生确认；
 * 2. 站内点击拦截：capture 阶段拿到 `a[href]`，先 preventDefault 再弹自己的
 *    确认框（Next Link 在冒泡阶段才处理，capture 能抢在它前面）。
 *
 * 已知边界：浏览器"后退"键不会触发 click，只能靠 `beforeunload` 之外的
 * popstate 处理——那需要往历史里塞哑条目，代价比收益大，这里刻意不做。
 */
export function useUnsavedGuard({ active, onBlocked }: UnsavedGuardOptions): void {
  const onBlockedRef = useRef(onBlocked);

  useEffect(() => {
    onBlockedRef.current = onBlocked;
  }, [onBlocked]);

  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 部分浏览器（Chrome < 119）仍要求给 returnValue 赋值才弹确认
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const handleClick = (event: MouseEvent) => {
      // 组合键点击（新标签页打开）不算离开当前页；中键由 auxclick 处理，这里不管
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      // 站外链接不拦（拦截后也没法用 router 跳）
      if (anchor.origin !== window.location.origin) return;
      if (
        !shouldInterceptNavigation(
          anchor.getAttribute("href"),
          window.location.pathname,
          false,
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onBlockedRef.current(anchor.href);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active]);
}
