/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

// 渲染断言只关心按钮上的类名：把路由与删除 action 挡掉，避免拉进 DB
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/server/actions/textbook", () => ({
  deleteTextbookAction: vi.fn(),
}));

/**
 * W2 防复发门禁：列表行的次要操作（删除 / 重命名）必须用 `hover-reveal`，
 * 不能用 `md:opacity-0`。
 *
 * 为什么：`md:` 断的是**视口宽度**，不是输入设备。
 *   - 手机横屏 ≥768px → 按钮被隐藏，手指悬停不存在 → 永远点不到；
 *   - 触屏笔记本 / 平板 → 同一断点下同样点不到。
 * `hover-reveal` 内部用 `@media (hover: hover)`，只有真能悬停的设备才隐藏，
 * 并且 `:focus-visible` 强制显示，键盘仍可达。
 *
 * jsdom 不做真实命中测试（没有布局与 pointer 事件），所以这里断言的是
 * 「源码里必须是 hover-reveal、且不得再出现 md:opacity-0」——
 * 真实触屏点按由 Playwright（CI）覆盖。
 */

const ROOT = process.cwd();

const TOUCH_TARGET_FILES = [
  "src/components/textbooks/DeleteTextbookButton.tsx",
  "src/app/notes/NoteSidebar.tsx",
  "src/app/mindmap/MindmapSidebar.tsx",
  "src/components/chat/ChatSidebar.tsx",
  "src/app/admin/activity/_components/ActivityList.tsx",
];

describe("hover-reveal：触屏设备上按钮常显（W2）", () => {
  it.each(TOUCH_TARGET_FILES)("%s 使用 hover-reveal 而非 md:opacity-0", (rel) => {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    expect(source).toContain("hover-reveal");
    expect(source).not.toMatch(/md:opacity-0/);
  });

  it("globals.css 定义了 hover-reveal，且只在 (hover: hover) 下隐藏", () => {
    const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    expect(css).toContain(".hover-reveal");

    // 隐藏规则必须被 @media (hover: hover) 包住；否则触屏上仍然不可见
    const mediaBlock = css.slice(css.indexOf("@media (hover: hover)"));
    expect(mediaBlock).toContain(".hover-reveal");
    expect(css).toContain(".hover-reveal:focus-visible");
  });

  it("类名在渲染结果里真的落到了按钮上（不是只写在注释里）", async () => {
    const { DeleteTextbookButton } = await import(
      "@/components/textbooks/DeleteTextbookButton"
    );
    render(<DeleteTextbookButton id={1} title="测试教材" />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("hover-reveal");
  });
});
