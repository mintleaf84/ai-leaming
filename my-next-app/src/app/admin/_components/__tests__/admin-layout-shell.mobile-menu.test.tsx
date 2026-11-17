/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";

/**
 * 批次 B5：移动端遮罩原本是 `div onClick`，键盘用户关不掉菜单
 * （没有 Esc、遮罩不可聚焦、X 在菜单里但菜单外的键盘用户没有路径）。
 *
 * 处置（第 2 类 + 真语义）：遮罩退化为纯鼠标便捷入口（tabIndex=-1 + aria-hidden），
 * 关闭路径改为 Esc（挂 document，键盘用户可达）+ 汉堡按钮 aria-expanded 反映状态。
 */

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push, refresh }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { AdminLayoutShell } from "../admin-layout-shell";

function renderShell() {
  return render(
    <AdminLayoutShell>
      <div>后台内容</div>
    </AdminLayoutShell>,
  );
}

const overlay = () =>
  document.querySelector(".bg-black\\/50") as HTMLElement | null;

describe("AdminLayoutShell 移动端菜单键盘路径（批次 B5）", () => {
  it("汉堡按钮反映菜单状态（aria-expanded / aria-controls）", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "打开菜单" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "admin-mobile-menu");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("admin-mobile-menu")).toHaveClass(
      "translate-x-0",
    );
    expect(overlay()).not.toBeNull();
  });

  it("Esc 能关掉移动端菜单（审计点名的真问题）", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "打开菜单" }));
    expect(overlay()).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "打开菜单" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(document.getElementById("admin-mobile-menu")).toHaveClass(
      "-translate-x-full",
    );
    expect(overlay()).toBeNull();
  });

  it("遮罩不进 Tab 序（不额外制造不可见焦点停靠点），点击仍能关闭", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "打开菜单" }));

    const scrim = overlay();
    expect(scrim).not.toBeNull();
    expect(scrim).toHaveAttribute("tabindex", "-1");
    expect(scrim).toHaveAttribute("aria-hidden", "true");

    await user.click(scrim!);
    expect(overlay()).toBeNull();
  });

  it("菜单内的关闭按钮仍有可访问名称且能关闭", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "打开菜单" }));
    await user.click(screen.getByRole("button", { name: "关闭菜单" }));

    expect(overlay()).toBeNull();
  });
});
