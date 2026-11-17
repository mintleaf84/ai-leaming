/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, vi } from "vitest";
import { expectFocusRing } from "@/test-utils/focus-indicator";
import NotePageClient from "../NotePageClient";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/notes/TagSelector", () => ({
  TagSelector: () => null,
}));

vi.mock("@/server/actions/note", () => ({
  updateNoteAction: vi.fn(async () => ({ data: { success: true } })),
}));

vi.mock("@/server/actions/feature-flags", () => ({
  getGlobalFeatureFlag: vi.fn(async () => true),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("NotePageClient 笔记大标题焦点指示（批次 B3）", () => {
  it("标题输入框可聚焦且有可见焦点指示", () => {
    render(
      <NotePageClient note={{ id: 1, title: "我的笔记", content: "{}" }} />,
    );

    const title = screen.getByPlaceholderText("无标题");
    expectFocusRing(title);
  });
});
