import type { ReactNode } from "react";

/**
 * 主操作的两种排版（同一个元素渲染两处，不要各写一份）：
 *
 * - 桌面端：跟随内容，不走固定底栏；
 * - 移动端：唯一一条固定底栏，主按钮落在拇指区（规格 §6.3）。
 *
 * 移动端这条 `fixed bottom-0` 与 `MobileNav` 会重叠，所以页面必须用
 * `usePageBottomBar` 登记「本页有底栏」（见 `components/layout/bottom-bar-slot`）。
 */
export function ActionBar({ actions }: { actions: ReactNode }) {
  return (
    <>
      <div className="mt-6 hidden md:block">{actions}</div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto w-full max-w-3xl">{actions}</div>
      </div>
    </>
  );
}
