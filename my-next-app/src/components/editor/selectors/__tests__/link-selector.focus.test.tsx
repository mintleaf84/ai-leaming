/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, vi } from "vitest";
import { expectFocusRing } from "@/test-utils/focus-indicator";
import { LinkSelector } from "../link-selector";

const chain = {
  focus: () => chain,
  setLink: () => chain,
  unsetLink: () => chain,
  run: () => true,
};

const fakeEditor = {
  isActive: () => false,
  getAttributes: () => ({ href: "" }),
  chain: () => chain,
};

vi.mock("novel", () => ({
  useEditor: () => ({ editor: fakeEditor }),
}));

describe("LinkSelector 链接 URL 输入框焦点指示（批次 B3）", () => {
  it("输入框可聚焦且有可见焦点指示", () => {
    render(<LinkSelector open onOpenChange={vi.fn()} />);

    const input = screen.getByPlaceholderText("粘贴链接地址...");
    expectFocusRing(input);
  });
});
