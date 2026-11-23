/** @vitest-environment jsdom */
/**
 * 扫码轮询的调度。
 *
 * 钉住的缺陷：轮询曾经挂在 `qrState` 依赖上，而首次查询必然还是 `pending`，
 * `setQrState` 收到相同值时 React 跳过渲染、effect 不再重跑，于是定时器只执行
 * 一次——之后无论用户扫码、确认还是二维码过期，页面都停在「等待扫码…」。
 * 现象就是用户报的：手机上点了确认，网页端毫无反应。
 *
 * 用 fake timers + 手动推进（不用 waitFor，它自带的定时器会被一起冻结）。
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FenbiBindDialog } from "../FenbiBindDialog";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const createFenbiQrcode = vi.fn();
const fetchFenbiQrcodeState = vi.fn();
const linkFenbiAccount = vi.fn();
const describeFenbiError = vi.fn((error: unknown) => String(error));

vi.mock("@/lib/hooks/useFenbiSync", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/hooks/useFenbiSync")
  >("@/lib/hooks/useFenbiSync");
  return {
    ...actual,
    createFenbiQrcode: () => createFenbiQrcode(),
    fetchFenbiQrcodeState: (lgtoken: string) => fetchFenbiQrcodeState(lgtoken),
    linkFenbiAccount: () => linkFenbiAccount(),
    describeFenbiError: (error: unknown) => describeFenbiError(error),
  };
});

const TICKET = {
  lgtoken: "tok-1",
  qrContent: "https://www.fenbi.com/depot/fenbi-scan-login/index.html",
  qrDataUrl: "data:image/png;base64,AAAA",
};

/** 推进假定时器并把期间产生的渲染冲刷掉。 */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderDialog(
  props: { onLinked?: () => void; onOpenChange?: () => void } = {},
) {
  render(
    <FenbiBindDialog
      open
      onOpenChange={props.onOpenChange ?? vi.fn()}
      defaultMode="qrcode"
      onLinked={props.onLinked ?? vi.fn()}
    />,
  );
}

/** 打开弹窗并等二维码就绪。 */
async function openAndLoad(props = {}) {
  renderDialog(props);
  await tick(0);
  expect(screen.queryByText(/正在生成二维码/)).toBeNull();
  expect(screen.getByAltText("粉笔登录二维码")).toBeInTheDocument();
}

describe("扫码轮询调度", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    createFenbiQrcode.mockResolvedValue(TICKET);
    fetchFenbiQrcodeState.mockResolvedValue({
      state: "pending",
      linked: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("状态没变化时也持续轮询（不靠 qrState 变化驱动）", async () => {
    await openAndLoad();

    // 4 个周期。修复前这里只有 1 次：pending → pending 不触发重渲染，
    // 挂在 qrState 上的 effect 不会重跑，轮询就此断掉。
    await tick(2000 * 4);

    expect(fetchFenbiQrcodeState).toHaveBeenCalledTimes(4);
    expect(fetchFenbiQrcodeState).toHaveBeenCalledWith(TICKET.lgtoken);
    expect(screen.getByText(/等待扫码/)).toBeInTheDocument();
  });

  it("拿到终态就停止轮询，不再对同一个 lgtoken 空转", async () => {
    fetchFenbiQrcodeState
      .mockResolvedValueOnce({ state: "pending", linked: false })
      .mockResolvedValue({ state: "expired", linked: false });
    await openAndLoad();

    await tick(2000 * 6);

    // 第 2 次返回 expired 之后就不该再排下一次。
    expect(fetchFenbiQrcodeState).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/二维码已过期/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /重新获取二维码/ }),
    ).toBeInTheDocument();
  });

  it("confirmed 且已落地凭证才提示绑定成功并关闭", async () => {
    const onLinked = vi.fn();
    const onOpenChange = vi.fn();
    await openAndLoad({ onLinked, onOpenChange });

    fetchFenbiQrcodeState.mockResolvedValue({
      state: "confirmed",
      linked: true,
    });
    await tick(2000);

    expect(onLinked).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("confirmed 但没取到凭证时不谎报绑定成功", async () => {
    const onLinked = vi.fn();
    await openAndLoad({ onLinked });

    fetchFenbiQrcodeState.mockResolvedValue({
      state: "noCredential",
      linked: false,
    });
    await tick(2000);

    expect(onLinked).not.toHaveBeenCalled();
    expect(screen.getByText(/没能取到登录凭证/)).toBeInTheDocument();
  });
});
