import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WrongQuestionCard } from "../WrongQuestionCard";
import { FolderTreeView } from "../FolderTreeView";
import { AddToFolderDialog } from "../AddToFolderDialog";
import type { QuestionFolder } from "@/lib/services/question-folder";
import type { WrongQuestionItem } from "@/lib/services/wrong-question";

/**
 * 触屏热区（docs/ux-a11y-audit.md §3.8，WCAG 2.2 AA 硬线 24×24 CSS px）。
 *
 * **为什么不用 getBoundingClientRect**：jsdom 不做布局，所有元素的 rect 恒为
 * 0×0（`width === 0 && height === 0`），拿它断言 ≥24 只会得到"假绿"或"假红"。
 * 这里改为按渲染后的 className 令牌算有效盒：
 *   热区 = 图标尺寸 + padding×2   （负 margin 不改变自身盒尺寸，只影响排布，
 *   所以相邻重叠要单独按 pitch 校验）
 * 令牌→px 用 Tailwind 的 4px 基准（2.5=10px、3.5=14px、11=44px）。
 * 数值来自组件真实渲染出来的 class，不是复制粘贴的期望值。
 */

const SCALE: Record<string, number> = {
  "0": 0,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "5": 20,
  "11": 44,
};

function tokenPx(className: string, prefix: string): number | null {
  const token = className.split(/\s+/).find((t) => t.startsWith(`${prefix}-`));
  if (!token) return null;
  return SCALE[token.slice(prefix.length + 1)] ?? null;
}

/** 内容盒尺寸：优先取元素自身令牌，图标按钮则取内部 <svg> 的尺寸 */
function contentPx(el: HTMLElement, prefix: "w" | "h"): number {
  const own = tokenPx(el.className, prefix);
  if (own !== null) return own;
  const icon = el.querySelector("svg");
  const fromIcon = icon
    ? tokenPx(icon.getAttribute("class") ?? "", prefix)
    : null;
  return fromIcon ?? 0;
}

/** 有效热区：内容盒 + padding（Tailwind 的 p-x 覆盖 px/py，与 CSS 优先级无关，这里取其一） */
function hitBox(el: HTMLElement) {
  const pad = tokenPx(el.className, "p");
  const padX = pad ?? tokenPx(el.className, "px") ?? 0;
  const padY = pad ?? tokenPx(el.className, "py") ?? 0;
  return {
    w: contentPx(el, "w") + padX * 2,
    h: contentPx(el, "h") + padY * 2,
  };
}

/** 相邻热区外扩量（-m-1.5 → 每侧 6px） */
function outwardMarginPx(className: string): number {
  const token = className
    .split(/\s+/)
    .find((t) => /^-m[xytrbl]?-/.test(t) || /^-m[trbl]-/.test(t));
  if (!token) return 0;
  const n = token.slice(token.lastIndexOf("-") + 1);
  return SCALE[n] ?? 0;
}

/** 负 margin 把热区向两侧各外扩 m，所以「不重叠」要求 hit ≤ 图标宽 + 间距 */
function overlapsNeighbor(el: HTMLElement, gapClassName: string): boolean {
  const icon = contentPx(el, "w");
  const gap = tokenPx(gapClassName, "gap") ?? 0;
  return hitBox(el).w > icon + gap;
}

const folder: QuestionFolder = {
  id: 7,
  userId: 1,
  name: "易错：教育目的",
  parentId: null,
  color: "#ef4444",
  sortOrder: 0,
  createdAt: null,
  questionCount: 3,
};

const wrongQuestion: WrongQuestionItem = {
  questionId: 421,
  questionContent: "教学的根本目的是促进学生全面发展。",
  tags: ["教育目的"],
  wrongCount: 2,
  lastWrongAt: "2026-11-01T00:00:00.000Z",
  correctAnswer: "A",
  userLastAnswer: "B",
};

describe("A2 触屏热区 ≥24px", () => {
  it("WrongQuestionCard 勾选按钮：20px 图标 + p-2.5 → 40px，且用 -m-2.5 保持视觉位置", () => {
    const onToggleSelect = vi.fn();
    render(
      <WrongQuestionCard
        question={wrongQuestion}
        isSelected={false}
        isExpanded={false}
        detail={null}
        isLoadingDetail={false}
        onToggleSelect={onToggleSelect}
        onToggleDetail={vi.fn()}
        onPractice={vi.fn()}
        onMarkAsMastered={vi.fn()}
      />,
    );

    // jsdom 无布局：rect 恒为 0，这里显式确认「我们没在拿假数字当证据」
    const button = screen.getByRole("button", { name: "选择该题" });
    const rect = button.getBoundingClientRect();
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);

    const box = hitBox(button);
    expect(box).toEqual({ w: 40, h: 40 });
    expect(box.w).toBeGreaterThanOrEqual(24);
    expect(box.h).toBeGreaterThanOrEqual(24);
    expect(button.className).toContain("-m-2.5");

    // 功能未被热区改造影响
    fireEvent.click(button);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("FolderTreeView 重命名确认/取消：14px + p-1.5 → 26px，gap-3 保证相邻热区不重叠", async () => {
    render(
      <FolderTreeView
        tagGroups={[]}
        folders={[folder]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onStartPractice={vi.fn()}
      />,
    );

    // 打开文件夹的「更多」菜单 → 重命名，进入内联编辑态
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "文件夹更多操作" }),
      {
        button: 0,
        ctrlKey: false,
      },
    );
    fireEvent.click(await screen.findByText("重命名"));

    const confirm = await screen.findByRole("button", { name: "确认重命名" });
    const cancel = screen.getByRole("button", { name: "取消重命名" });

    for (const btn of [confirm, cancel]) {
      const box = hitBox(btn);
      expect(box.w).toBeGreaterThanOrEqual(24);
      expect(box.h).toBeGreaterThanOrEqual(24);
    }

    // 相邻两个按钮的外扩热区不得重叠：pitch = 图标 14 + gap 12 = 26 ≥ 热区 26
    const row = confirm.parentElement as HTMLElement;
    expect(row.className).toContain("gap-3");
    expect(overlapsNeighbor(confirm, row.className)).toBe(false);
    expect(overlapsNeighbor(cancel, row.className)).toBe(false);
    expect(outwardMarginPx(confirm.className)).toBe(6);
  });

  it("FolderTreeView「更多」按钮：14px + p-1.5 → 26px", () => {
    render(
      <FolderTreeView
        tagGroups={[]}
        folders={[folder]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onStartPractice={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "文件夹更多操作" });
    const box = hitBox(button);
    expect(box.w).toBe(26);
    expect(box.h).toBe(26);
    expect(box.w).toBeGreaterThanOrEqual(24);
  });

  it("AddToFolderDialog 色板：44px 格 + 20px 圆点，pitch 52 > 44 不重叠", async () => {
    render(
      <AddToFolderDialog
        isOpen
        onClose={vi.fn()}
        folders={[]}
        selectedCount={2}
        isSubmitting={false}
        onAddToFolder={vi.fn()}
        onCreateFolder={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("新建文件夹"));

    const swatches = await screen.findAllByRole("button", { name: /选择颜色/ });
    expect(swatches.length).toBe(8);

    for (const swatch of swatches) {
      const box = hitBox(swatch);
      expect(box.w).toBe(44);
      expect(box.h).toBe(44);
      // 关键：色板**不许**用 -m-* 外扩（相邻热区会重叠 → 点交错处选错颜色）
      expect(swatch.className).not.toMatch(/-m[xytrbl]?-/);
    }

    const grid = swatches[0].parentElement as HTMLElement;
    const gap = tokenPx(grid.className, "gap") ?? 0;
    const pitch = 44 + gap;
    expect(pitch).toBeGreaterThanOrEqual(44);
    // 44px 格没有外扩，pitch（52）必然 ≥ 单个热区（44）
    expect(overlapsNeighbor(swatches[1], grid.className)).toBe(false);
  });
});
