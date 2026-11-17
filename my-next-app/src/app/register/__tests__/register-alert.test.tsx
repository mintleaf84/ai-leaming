/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "../page";

/**
 * §3.7（批次 B4）：注册失败的红色提示条以前是普通 div —— 无 role="alert"，
 * 焦点也不移动。键盘用户在表单底部点"立即注册"，错误出现在表单顶部，
 * 既听不到也看不到。
 *
 * 这里用**客户端校验失败**（两次密码不一致）触发错误：不发请求，
 * 与其他页面的用例互不干扰，且这条路径正是键盘用户最容易踩到的。
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("注册失败提示（§3.7）", () => {
  it("两次密码不一致：错误条 role=alert 且获得焦点", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText("用户名"), "newuser");
    await user.type(
      screen.getByPlaceholderText("设置密码 (至少6位)"),
      "abc123",
    );
    await user.type(screen.getByPlaceholderText("确认密码"), "abc124");
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("两次输入的密码不一致");

    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    expect(alert).toHaveAttribute("tabindex", "-1");
  });
});
