// @vitest-environment node
/**
 * 底部预留必须把 iPhone 安全区算进去（docs/ux-a11y-audit.md §3.2，工程计划 M6 / A6）。
 *
 * ## 为什么需要一道静态门禁
 *
 * e2e（tests/visual/layout-guard.spec.ts）在 375 视口下断言 `<main>` 的
 * `padding-bottom ≥ 96px`，但**浏览器里 `env(safe-area-inset-bottom)` 恒为 0**
 * —— 真的 iPhone 上它是 34px。所以 e2e 只能验「88px 导航 + 8px 呼吸」那一段，
 * 谁把 `calc(6rem + env(safe-area-inset-bottom))` "简化"成 `pb-24`（96px 固定值），
 * Playwright 依然全绿，真机上最后一行仍会被导航压住 26px。
 *
 * 这道门禁直接读源码/样式表，钉住两件事：
 *   1. 预留公式里**必须**出现 `env(safe-area-inset-bottom)`，且基数是 6rem；
 *   2. `<main>` 上不允许出现固定 `pb-<数字>`（`md:pb-0` 例外：桌面端 MobileNav 是 md:hidden）。
 *
 * 它验的是「写法」，不是「渲染结果」。渲染结果由 e2e 那条负责。两者都不能省。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "..");
const LAYOUT_TSX = path.join(APP_DIR, "layout.tsx");

/**
 * 预留公式：`calc(6rem + env(safe-area-inset-bottom))`。
 * 允许空白与替代写法 `6rem+env(...)`；基数必须是 6rem（96px = 88px + 8px），
 * 改成 5rem/7rem 都意味着与 MobileNav 的实际高度脱钩，应当失败。
 */
const RESERVE_CALC =
  /calc\(\s*6rem\s*\+\s*env\(\s*safe-area-inset-bottom\s*\)\s*\)/;

function readLayout(): string {
  return fs.readFileSync(LAYOUT_TSX, "utf8");
}

/** 取 `<main …>` 开标签上的 className（本仓库只有一个全局 main） */
function mainClassName(source: string): string[] {
  const tag = /<main\b[^>]*>/.exec(source);
  expect(
    tag,
    "src/app/layout.tsx 里找不到 <main> 开标签；布局契约变了，请同步更新本门禁",
  ).not.toBeNull();
  const className = /className="([^"]*)"/.exec(tag?.[0] ?? "");
  expect(
    className,
    "src/app/layout.tsx 的 <main> 没有 className（底部预留依赖它）：布局契约变了，请同步更新本门禁",
  ).not.toBeNull();
  return (className?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("全局布局的底部预留（M6/A6）", () => {
  it("<main> 的 padding-bottom 用 6rem + 安全区，而不是固定值", () => {
    const tokens = mainClassName(readLayout());

    const paddingToken = tokens.find((token) => token.startsWith("pb-["));
    expect(
      paddingToken,
      `src/app/layout.tsx 的 <main> 上找不到 pb-[…] 底部预留（现有 class：${tokens.join(" ")}）`,
    ).toBeDefined();
    expect(
      paddingToken,
      `底部预留必须写成 pb-[calc(6rem+env(safe-area-inset-bottom))]：` +
        `6rem=96px 是 MobileNav 的 88px + 8px 呼吸，env(...) 是 iPhone 安全区。` +
        `实际为 ${paddingToken}`,
    ).toMatch(RESERVE_CALC);
    expect(
      paddingToken,
      `底部预留必须含 env(safe-area-inset-bottom)，否则真机上最后一行仍被导航压住（实际为 ${paddingToken}）`,
    ).toContain("env(safe-area-inset-bottom)");
  });

  it("<main> 的 scroll-padding-bottom 同样算安全区（Tab 聚焦不被固定导航盖住）", () => {
    const tokens = mainClassName(readLayout());

    const scrollToken = tokens.find((token) => token.startsWith("scroll-pb-["));
    expect(
      scrollToken,
      `<main> 上少了 scroll-pb-[…]：main 是内部滚动容器，不给 scroll-padding 时 ` +
        `Tab 聚焦到被 MobileNav 盖住的控件不会让位（focus-not-obscured）。现有 class：${tokens.join(" ")}`,
    ).toBeDefined();
    expect(
      scrollToken,
      `scroll-padding 必须写成 calc(6rem+env(safe-area-inset-bottom))，与 padding 同口径。实际为 ${scrollToken}`,
    ).toMatch(RESERVE_CALC);
  });

  it("<main> 不允许退回固定 pb 值（桌面端 md:pb-0 例外）", () => {
    const tokens = mainClassName(readLayout());

    // pb-4 / pb-20 / pb-[96px] / pb-[6rem] 都是「固定值」形态；只有 md:pb-0 允许，
    // 因为 MobileNav 是 md:hidden，桌面端不需要预留。
    // 含 calc()/env()/var() 的任意值不算固定值 —— 它们能把安全区算进来。
    const dynamic = /(?:env|var|calc)\(/;
    const fixedPadding = tokens.filter((token) => {
      if (token === "md:pb-0") return false;
      const value = /(?:^|:)pb-(.+)$/.exec(token)?.[1];
      if (!value) return false;
      return !dynamic.test(value);
    });

    expect(
      fixedPadding,
      `<main> 上出现了固定底部预留 ${JSON.stringify(fixedPadding)}。` +
        `固定值算不进 iPhone 的 safe-area（34px），必须用 calc(6rem+env(safe-area-inset-bottom))。`,
    ).toEqual([]);
  });

  it("桌面端保留 0 预留（MobileNav 是 md:hidden）", () => {
    const tokens = mainClassName(readLayout());

    expect(tokens).toContain("md:pb-0");
    expect(tokens).toContain("md:scroll-pb-0");
  });
});
