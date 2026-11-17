import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 视口单位与滚动模型的门禁（M6 · T-12a）
 *
 * 1. 源码里不得再出现 `100vh` —— 软键盘弹出时 `vh` 不变、`dvh` 会缩，
 *    用 `vh` 的整屏容器会把输入区顶出可视区。这类回归肉眼在桌面上看不出来。
 * 2. `overscroll-behavior-y` 两处都要有：`html`（视口层级，挡下拉刷新）与
 *    `main`（容器内橡皮筋）。原先只有 html 那一处，容器内回弹没人管；
 *    而 html 那处也**不是空操作**（上一版注释写错过，评审纠正）。
 * 3. Radix 的滚动锁只打给 body，当前滚动容器是 main，必须有一条补锁规则；
 *    这条规则在 T-12b 改回 body 滚动后应当删除，届时本用例要跟着改。
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    // 排除测试自身：用例里要写 "100vh" 这个字面量来断言它不该出现，
    // 不排除的话门禁会命中自己
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.(tsx?|css)$/.test(name)
        ? [full]
        : [];
  });
}

/** 取 CSS 里某个选择器的规则体（顶层，够用且不需要引入 CSS 解析器） */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `找不到选择器 ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  // 去掉注释再判断：`html` 的规则体里有一句解释「原来那行已挪走」的注释，
  // 不去掉的话门禁会被自己的说明命中
  return css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("视口单位与滚动模型", () => {
  it("源码里不再使用 100vh（软键盘弹出时不会缩，会把输入区顶出）", () => {
    const offenders = walk(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("100vh"))
      .map((file) => file.replace(`${process.cwd()}/`, ""));

    // 这条断言防的是"新写一个整屏容器又用回 vh"，桌面端完全看不出差别
    expect(offenders, `请改用 100dvh：${offenders.join(", ")}`).toEqual([]);
  });

  it("overscroll-behavior-y 两处都要有，且都是 none（两处管的是不同的事）", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");

    // html：视口层级 —— 挡从 main 之外（底部导航）起的下拉刷新。
    // 这条**不是空操作**：html 是文档级滚动容器，即便 body 是 overflow:hidden。
    expect(ruleBody(css, "html")).toContain("overscroll-behavior-y: none");

    // main：容器内橡皮筋 —— 必须写在真正滚动的元素上。
    // 用 none 而不是 contain：contain 只阻断跨元素滚动链，本地回弹照样发生。
    expect(ruleBody(css, "main")).toContain("overscroll-behavior-y: none");
  });

  it("Radix 弹窗打开时补锁 main（body 锁对内部滚动容器无效）", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");

    expect(css).toContain("body[data-scroll-locked] main");
  });
});
