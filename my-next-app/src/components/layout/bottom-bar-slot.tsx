"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * 页面级固定底栏登记处。
 *
 * 背景（docs/ui-system.md §6）：一个移动端页面最多一条固定底栏。`MobileNav` 自身是
 * `fixed bottom-[calc(1.5rem+safe-area)]`，与页面自带的操作栏（`fixed bottom-0`）会重叠。
 *
 * 为什么不是「按路由白名单隐藏」：`/wrong-book` 的操作栏是**条件渲染**的（选中题目才出现），
 * 按路由一刀切会让「没选中任何题目」的页面既没有操作栏也没有主导航。
 * 所以改成页面自己声明 —— 底栏真正渲染时登记，卸载/条件变 false 时归还，
 * `MobileNav` 只问「当前有没有页面级底栏」。
 *
 * 实现要点（踩坑记录）：
 *   - **计数而不是布尔**：同一页面可能有多处声明（或过渡期两套组件并存），布尔会让
 *     先卸载的一方把仍在显示的底栏一起"归还"掉。
 *   - **计数与 setter 拆成两个 context**：setter 必须引用稳定，否则 `count` 变化会
 *     改变 context value 身份 → 触发所有登记者的 effect 重跑 → 再 `set(true)`，
 *     形成无限自增循环。`usePageBottomBar` 的依赖里只有稳定的 `set` 与 `active`。
 *   - **SSR 安全**：全部状态在客户端，服务端渲染时计数为 0（`MobileNav` 照常出现），
 *     水合后由 effect 校正；没有 `window` 访问，不会在服务端报错。
 *   - **StrictMode 双调用**：React 18/19 开发态会「执行 effect → 清理 → 再执行 effect」，
 *     序列是 +1 / -1 / +1，净增 1，正好等于一次真实挂载；`Math.max(0, …)` 兜住
 *     极端情况下重复清理造成的负数。
 */

type BottomBarSetter = (on: boolean) => void;

const BottomBarCountContext = createContext(0);
const BottomBarSetterContext = createContext<BottomBarSetter>(() => {});

/** 包在 `MobileNav`（以及任何要感知底栏的组件）外层；必须是 client component */
export function BottomBarProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const set = useCallback<BottomBarSetter>((on) => {
    setCount((prev) => Math.max(0, prev + (on ? 1 : -1)));
  }, []);

  return (
    <BottomBarSetterContext.Provider value={set}>
      <BottomBarCountContext.Provider value={count}>
        {children}
      </BottomBarCountContext.Provider>
    </BottomBarSetterContext.Provider>
  );
}

/**
 * 声明「本页有页面级固定底栏」。
 *
 * @param active 底栏当前是否真的渲染；条件渲染的页面把同一个布尔传进来即可。
 *   为 `false` 时什么都不做（不登记），从 `false` 变 `true` 才登记。
 */
export function usePageBottomBar(active: boolean = true): void {
  const set = useContext(BottomBarSetterContext);

  useEffect(() => {
    if (!active) return;
    set(true);
    // 卸载、路由切换、active 变 false 都走这里归还，不会把计数漏掉
    return () => set(false);
  }, [set, active]);
}

/** 当前页面是否存在页面级固定底栏（`MobileNav` 据此让位） */
export function useHasPageBottomBar(): boolean {
  return useContext(BottomBarCountContext) > 0;
}
