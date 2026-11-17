import { expect } from "vitest";

/**
 * 焦点指示的可检查契约（批次 B3，WCAG 2.4.7 / 1.4.11）。
 *
 * jsdom 里做不了"像素级"验证，原因有两条，这里如实说明：
 *  1. 测试不加载 Tailwind 生成的 CSS（没有样式表），所以 `getComputedStyle(el).boxShadow`
 *     永远是空串，断言它"不为 none"是恒真的假绿；
 *  2. jsdom 不实现 `:focus-visible` 伪类（`el.matches(":focus-visible")` 恒为 false），
 *     所以无法靠伪类激活去观察 ring 是否生效。
 *
 * 因此分成两段验证：
 *  A. 可聚焦性（真跑）：`focus()` 后 `document.activeElement` 必须是元素本身 —— 这条能抓
 *     tabIndex=-1 / disabled / pointer-events 之类让元素无法获得键盘焦点的回归；
 *  B. 指示类存在（读 className）：`focus-visible:ring-2` + `focus-visible:ring-ring`
 *     必须在类串里。这是本仓库"删了 outline 但没有替代"的根因形态，直接盯这个形态。
 *
 * 真实渲染效果（ring 是否可见、对比度）由 `--ring` 的实测对比度 + 人工/浏览器验证覆盖，
 * 不假装在 jsdom 里测到。
 */
export function expectFocusRing(el: HTMLElement) {
  el.focus();

  // A. 真的能聚焦
  expect(document.activeElement).toBe(el);
  expect(el.matches(":focus")).toBe(true);

  // B. 有替代指示，且不是"只有 outline-none"
  const className = el.className;
  expect(className).toMatch(/(^|\s)focus-visible:outline-none(\s|$)/);
  expect(className).toMatch(/(^|\s)focus-visible:ring-2(\s|$)/);
  expect(className).toMatch(/(^|\s)focus-visible:ring-ring(\s|$)/);

  // 去掉 outline 的同时必须留下别的可见变化：ring-offset-*（外描边环）或 ring-inset（内描边环）
  const hasOffset = /focus-visible:ring-offset-\d/.test(className);
  const hasInset = /focus-visible:ring-inset/.test(className);
  expect(hasOffset || hasInset).toBe(true);
}
