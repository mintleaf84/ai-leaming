import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- 稳定的 mock 引用（hoisted，模块工厂里只能用它们） ---
const { mockGetApiKeys } = vi.hoisted(() => ({
  mockGetApiKeys: vi.fn(),
}));

vi.mock("@/server/actions/api-keys", () => ({
  getApiKeysAction: mockGetApiKeys,
  createApiKeyAction: vi.fn(),
  toggleApiKeyAction: vi.fn(),
  deleteApiKeyAction: vi.fn(),
}));

import { useApiKeysData } from "../use-api-keys-data";

const keyRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  key_string: `sk_${String(id).padStart(8, "0")}deadbeefdeadbeef`,
  description: `key-${id}`,
  is_active: 1,
  user_id: null,
  scopes: "read",
  last_used_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("useApiKeysData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("首屏加载：先 loading，数据到位后落地列表与两个计数", async () => {
    mockGetApiKeys.mockResolvedValue({
      data: [
        keyRow(1),
        keyRow(2, { is_active: 0, user_id: 7 }),
        keyRow(3, { scopes: "admin" }),
      ],
      serverError: undefined,
    });

    const { result } = renderHook(() => useApiKeysData());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetApiKeys).toHaveBeenCalledTimes(1);
    expect(result.current.keys.map((k) => k.id)).toEqual([1, 2, 3]);
    expect(result.current.loadError).toBeNull();
    // 计数派生自同一份列表（不多请求一次）
    expect(result.current.activeCount).toBe(2);
    expect(result.current.globalCount).toBe(2);
  });

  it("取数失败：错误原文进 error 态，列表不清空成「空态」", async () => {
    mockGetApiKeys.mockResolvedValue({
      data: undefined,
      serverError: "数据库不可用",
    });

    const { result } = renderHook(() => useApiKeysData());

    await waitFor(() => expect(result.current.loadError).toBe("数据库不可用"));

    expect(result.current.loading).toBe(false);
    expect(result.current.keys).toEqual([]);
  });

  it("空 data 也算加载失败（不能显示成空列表）", async () => {
    mockGetApiKeys.mockResolvedValue({
      data: undefined,
      serverError: undefined,
    });

    const { result } = renderHook(() => useApiKeysData());

    await waitFor(() =>
      expect(result.current.loadError).toBe("密钥列表返回为空，请稍后重试"),
    );
    expect(result.current.loading).toBe(false);
  });

  it("reload 重新取数一次并替换列表（错误态重试走同一条路径）", async () => {
    mockGetApiKeys.mockResolvedValueOnce({
      data: undefined,
      serverError: "数据库不可用",
    });

    const { result } = renderHook(() => useApiKeysData());
    await waitFor(() => expect(result.current.loadError).toBe("数据库不可用"));

    mockGetApiKeys.mockResolvedValueOnce({
      data: [keyRow(9)],
      serverError: undefined,
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(mockGetApiKeys).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
    expect(result.current.keys.map((k) => k.id)).toEqual([9]);
    expect(result.current.loading).toBe(false);
  });
});
