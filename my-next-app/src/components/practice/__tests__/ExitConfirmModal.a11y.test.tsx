/** @vitest-environment jsdom */
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { ExitConfirmModal } from "../ExitConfirmModal";

/**
 * 批次 B2：退出确认框从自建 fixed 浮层换成 ui/alert-dialog。
 * 这组测试锁的是「语义 + 键盘 + 焦点」三件事，以及改造前就有的交互不能丢。
 */
function Harness({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>退出练习</button>
      <ExitConfirmModal
        isOpen={open}
        onCancel={() => {
          setOpen(false);
          onCancel();
        }}
        onConfirm={() => {
          // 真实实现里 confirmExit 是 router.push("/")，不靠这里关浮层
          onConfirm();
        }}
      />
    </>
  );
}

function openDialog() {
  const trigger = screen.getByRole("button", { name: "退出练习" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("ExitConfirmModal（批次 B2：换成 AlertDialog）", () => {
  it("有 dialog 语义：role=alertdialog + aria-modal", async () => {
    render(<Harness onCancel={vi.fn()} onConfirm={vi.fn()} />);
    openDialog();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("确定要退出吗？");
  });

  it("打开后焦点移入浮层（原来完全没有焦点移入）", async () => {
    render(<Harness onCancel={vi.fn()} onConfirm={vi.fn()} />);
    openDialog();

    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("Esc 关闭（改造前按 Esc 没反应）", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={vi.fn()} />);
    openDialog();
    await screen.findByRole("alertdialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("取消按钮仍走 onCancel，且关闭后焦点回到触发元素", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={vi.fn()} />);
    const trigger = openDialog();
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("确认按钮只走 onConfirm，不会被当成一次「取消」", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />);
    openDialog();
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "退出练习" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    // Action 自己会触发一次 onOpenChange(false)，别顺带执行 onCancel
    await waitFor(() => expect(onCancel).not.toHaveBeenCalled());
  });

  it("点遮罩不关闭（改造前也没有这个关闭方式，属于刻意保持）", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={vi.fn()} />);
    openDialog();
    await screen.findByRole("alertdialog");

    const overlay = document.querySelector(".bg-black\\/50");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
