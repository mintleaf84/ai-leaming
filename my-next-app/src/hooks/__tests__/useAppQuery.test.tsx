/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAppQuery } from "../useAppQuery";

/**
 * `useAppQuery` 的四态契约（W1.1 防复发门禁的核心）。
 *
 * 页面依赖这三条语义才不会把失败渲染成空态：
 *  1. 首次加载：isLoading=true，data=undefined，isError=false；
 *  2. 失败：isError=true，error 是 Error 实例，data 仍是 undefined；
 *  3. retry() 触发重跑，成功后可拿到 data（且不抛异常）。
 */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
}

describe("useAppQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("首次加载时 isLoading=true、data 为空、isError=false", () => {
    const queryFn = vi.fn(() => new Promise<string[]>(() => {}));
    const { result } = renderHook(
      () => useAppQuery({ queryKey: ["loading-case"], queryFn }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("请求失败时 isError=true、error 是 Error，且 data 仍是 undefined（不能伪装成空数据）", async () => {
    const queryFn = vi.fn(() => Promise.reject(new Error("接口 500")));
    const { result } = renderHook(
      () => useAppQuery<string[]>({ queryKey: ["error-case"], queryFn }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("接口 500");
    expect(result.current.data).toBeUndefined();
  });

  it("retry() 返回 void 并重新触发请求，成功后拿到 data", async () => {
    let attempt = 0;
    const queryFn = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("第一次失败");
      return ["恢复的数据"];
    });

    const { result } = renderHook(
      () => useAppQuery<string[]>({ queryKey: ["retry-case"], queryFn }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    // ErrorState.onRetry 是按钮回调：返回 void 才不会产生未处理的 rejection
    let returned: unknown;
    act(() => {
      returned = result.current.retry();
    });
    expect(returned).toBeUndefined();

    await waitFor(() => expect(result.current.data).toEqual(["恢复的数据"]));
    expect(result.current.isError).toBe(false);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
