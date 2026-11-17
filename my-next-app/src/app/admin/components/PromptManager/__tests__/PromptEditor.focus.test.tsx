/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, vi } from "vitest";
import { expectFocusRing } from "@/test-utils/focus-indicator";
import { PromptEditor } from "../PromptEditor";
import type { PromptTemplate } from "@/lib/services/prompt";

const editingPrompt = {
  id: 1,
  key: "answer_generation",
  description: "答案解析提示词",
  template: "请解析：{{question}}",
  systemDefault: "系统默认模板",
  variables: ["question"],
} as unknown as PromptTemplate;

describe("PromptEditor 提示词编辑区焦点指示（批次 B3）", () => {
  it("原始/自定义模板 textarea 可聚焦且有可见焦点指示", () => {
    render(
      <PromptEditor
        editingPrompt={editingPrompt}
        isSaving={false}
        onSave={vi.fn()}
        onReset={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "当前使用系统默认提示词，可在此输入自定义内容覆盖...",
    );
    expectFocusRing(textarea);
  });
});
