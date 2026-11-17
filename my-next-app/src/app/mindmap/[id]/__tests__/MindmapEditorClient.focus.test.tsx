/** @vitest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { expectFocusRing } from "@/test-utils/focus-indicator";
import MindmapEditorClient from "../MindmapEditorClient";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/server/actions/mindmap", () => ({
  generateMindmapAction: vi.fn(async () => ({ success: true })),
  updateMindmapAction: vi.fn(async () => ({ success: true })),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("MindmapEditorClient 焦点指示（批次 B3）", () => {
  const mindmap = { id: 7, title: "我的导图", content: "# 一级\n## 二级" };

  it("导图标题输入框可聚焦且有可见焦点指示", () => {
    render(<MindmapEditorClient mindmap={mindmap} />);

    const title = document.querySelector<HTMLInputElement>(
      'input[placeholder="在此输入思维导图标题"]',
    );
    expect(title).not.toBeNull();
    expectFocusRing(title!);
  });

  it("Markdown 大纲 textarea 可聚焦且有可见焦点指示（内描边，避免被父容器 overflow 裁掉）", () => {
    render(<MindmapEditorClient mindmap={mindmap} />);

    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    expectFocusRing(textarea!);
    // 全幅面板用 inset 环：外环会被 overflow-hidden 的左右分栏切掉
    expect(textarea!.className).toContain("focus-visible:ring-inset");
  });
});
