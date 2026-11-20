import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExamCountdown } from "../use-countdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("useExamCountdown", () => {
  it("按 deadline 显示剩余时间，并随真实时间推进减少", () => {
    vi.useFakeTimers();
    const deadline = new Date(Date.now() + 90_000).toISOString();
    const { result } = renderHook(() =>
      useExamCountdown(deadline, vi.fn(), { intervalMs: 1_000 }),
    );

    expect(result.current.remaining).toBeGreaterThan(85_000);
    expect(result.current.formatted).toBe("01:30");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.formatted).toBe("01:00");
    expect(result.current.warning).toBe(true);
  });

  it("到点只触发一次 onExpire，之后的 tick 不再重复", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const deadline = new Date(Date.now() + 2_000).toISOString();
    renderHook(() => useExamCountdown(deadline, onExpire, { intervalMs: 500 }));

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("间隔被节流时按 now 重算，而不是每秒减一", () => {
    vi.useFakeTimers();
    let now = Date.now();
    const deadline = new Date(now + 60_000).toISOString();
    const { result } = renderHook(() =>
      useExamCountdown(deadline, vi.fn(), { now: () => now, intervalMs: 500 }),
    );

    // 模拟切后台 20 秒：期间没有 tick
    now += 20_000;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.formatted).toBe("00:40");
  });

  it("卸载后不再触发回调", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const deadline = new Date(Date.now() + 1_000).toISOString();
    const { unmount } = renderHook(() =>
      useExamCountdown(deadline, onExpire, { intervalMs: 200 }),
    );

    unmount();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("不限时（没有 deadline）不进入倒计时", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const { result } = renderHook(() => useExamCountdown(null, onExpire));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.remaining).toBeNull();
    expect(result.current.formatted).toBe("--:--");
    expect(result.current.expired).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
