/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

import { KnowledgeCardItem } from "../components/KnowledgeCardItem";
import { KnowledgeCardExpanded } from "../components/KnowledgeCardExpanded";
import type { KnowledgeCard } from "@/lib/services/knowledge";

/**
 * 钉住「卡片 → 全屏卡片」的共享布局动画契约（M6 批次 B2 的既有产品决策）。
 *
 * 换成 Radix 时最容易顺手丢掉的就是 `layoutId`：jsdom 没有布局测量，framer 不会
 * 跑 projection，光看 DOM 是看不出来的（`data-projection-id` 根本不出现）。所以这里
 * 把 `motion.*` 换成原样透传的普通元素，把 `layoutId` 落成 `data-layout-id`，
 * 再断言两端用的是**同一组** layoutId —— 谁把展开态的 layoutId 删了/改了前缀，这条就红。
 */
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();

  const make = (tag: string) => {
    const Component = React.forwardRef<HTMLElement, Record<string, unknown>>(
      (props, ref) => {
        const {
          layoutId,
          layout: _layout,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          whileHover: _whileHover,
          whileTap: _whileTap,
          children,
          ...rest
        } = props;
        return React.createElement(
          tag,
          {
            ...rest,
            ref,
            "data-layout-id":
              typeof layoutId === "string" ? layoutId : undefined,
          },
          children as React.ReactNode,
        );
      },
    );
    Component.displayName = `motion.${tag}`;
    return Component;
  };

  const motion = new Proxy({}, { get: (_target, tag: string) => make(tag) });

  return { ...actual, motion: motion as typeof actual.motion };
});

const CARD = {
  id: 42,
  title: "广域课程",
  category: "教育学基础",
  front: "问题",
  back: "答案",
  tags: ["课程"],
  key_points: [],
} as KnowledgeCard;

/** 某个子树里所有 `layoutId`（mock 落到 `data-layout-id` 上） */
function layoutIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll("[data-layout-id]")).map(
    (node) => node.getAttribute("data-layout-id") as string,
  );
}

const SHARED_IDS = ["card-container-42", "card-title-42", "card-cat-42"];

describe("KnowledgeCardExpanded 的共享布局动画", () => {
  it("展开态与网格卡片用同一组 layoutId（container / title / cat）", () => {
    const grid = render(
      <KnowledgeCardItem
        card={CARD}
        onExpand={() => undefined}
        onEdit={() => undefined}
        categoryColor={{ bg: "bg-muted", text: "text-foreground" }}
      />,
    );
    expect(layoutIds(grid.container)).toEqual(
      expect.arrayContaining(SHARED_IDS),
    );
    grid.unmount();

    const expanded = render(
      <KnowledgeCardExpanded card={CARD} onClose={() => undefined} />,
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(layoutIds(dialog)).toEqual(expect.arrayContaining(SHARED_IDS));

    expanded.unmount();
  });
});
