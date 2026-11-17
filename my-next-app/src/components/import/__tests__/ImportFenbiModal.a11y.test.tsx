/** @vitest-environment jsdom */
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportFenbiModal } from "../ImportFenbiModal";

/**
 * 批次 B2：粉笔导入浮层从自建 fixed 浮层换成 ui/dialog。
 * 改造前它能用 X 和点遮罩关闭，没有 dialog 语义、没有 Esc、没有焦点移入。
 */
vi.mock("@/server/actions/import", () => ({
  getImportTokenAction: vi.fn(),
  previewFenbiDataAction: vi.fn(),
  importFenbiDataAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getImportTokenAction } from "@/server/actions/import";

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>导入粉笔</button>
      <ImportFenbiModal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        onSuccess={vi.fn()}
      />
    </>
  );
}

function openModal() {
  const trigger = screen.getByRole("button", { name: "导入粉笔" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("ImportFenbiModal（批次 B2：换成 Dialog）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      getImportTokenAction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: "" });
  });

  it("有 dialog 语义：role=dialog + aria-modal + 可访问名称", async () => {
    render(<Harness onClose={vi.fn()} />);
    openModal();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("导入粉笔错题");
    expect(dialog).toHaveAccessibleDescription("从粉笔 APP 导入练习记录和题目");
  });

  it("打开后焦点在浮层内（原来完全不移焦点）", async () => {
    render(<Harness onClose={vi.fn()} />);
    openModal();

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("Esc 关闭（改造前只能点 X 或遮罩）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openModal();
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("点遮罩仍能关闭（原有行为）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openModal();
    await screen.findByRole("dialog");

    const overlay = document.querySelector(".bg-black\\/50");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("关闭后焦点回到触发元素", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = openModal();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("X 关闭仍可用，且有可访问名称", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openModal();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
