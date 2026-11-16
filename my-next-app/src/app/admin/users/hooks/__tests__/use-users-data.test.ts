import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- 稳定的 mock 引用（hoisted，模块工厂里只能用它们） ---
const { mockGetUsers, mockGetPlans, mockToastWarning } = vi.hoisted(() => ({
  mockGetUsers: vi.fn(),
  mockGetPlans: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock("@/server/actions/admin", () => ({
  getUsersAction: mockGetUsers,
  deleteUserAction: vi.fn(),
  resetUserPasswordAction: vi.fn(),
  updateUserRoleAction: vi.fn(),
  revokeUserSessionAction: vi.fn(),
}));

vi.mock("@/server/actions/subscription", () => ({
  getPlansAction: mockGetPlans,
  setUserSubscriptionAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: mockToastWarning,
  },
}));

import { useUsersData } from "../use-users-data";

const userRow = (id: number) => ({
  id,
  username: `user-${id}`,
  role: "student",
  created_at: "2026-01-01T00:00:00.000Z",
  token_version: 1,
  is_admin: false,
});

const usersPage = (ids: number[], total: number) => ({
  data: { users: ids.map(userRow), total },
  serverError: undefined,
});

describe("useUsersData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlans.mockResolvedValue({
      data: { success: true, plans: [] },
      serverError: undefined,
    });
  });

  it("首屏加载：先 loading，数据到位后落地列表与总数", async () => {
    mockGetUsers.mockResolvedValue(usersPage([1, 2], 12));

    const { result } = renderHook(() => useUsersData());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetUsers).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      query: "",
    });
    expect(result.current.users.map((u) => u.id)).toEqual([1, 2]);
    expect(result.current.total).toBe(12);
    expect(result.current.loadError).toBeNull();
  });

  it("搜索关键字变化会带着新 query 重新取数，并回到第一页", async () => {
    mockGetUsers.mockResolvedValue(usersPage([1], 1));

    const { result } = renderHook(() => useUsersData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSearch("bob");
    });

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith({
        limit: 10,
        offset: 0,
        query: "bob",
      });
    });
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it("翻页按 1 起页码换算 offset", async () => {
    mockGetUsers.mockResolvedValue(usersPage([11, 12], 22));

    const { result } = renderHook(() => useUsersData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setPage(2);
    });

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith({
        limit: 10,
        offset: 10,
        query: "",
      });
    });
  });

  it("取数失败进入 error 态，并且把原因写进日志（不静默吞掉）", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUsers.mockResolvedValue({
      data: undefined,
      serverError: "数据库不可用",
    });

    const { result } = renderHook(() => useUsersData());

    await waitFor(() => expect(result.current.loadError).toBe("数据库不可用"));

    expect(result.current.loading).toBe(false);
    expect(result.current.users).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("空 data 也算加载失败（不能显示成空列表）", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUsers.mockResolvedValue({ data: undefined, serverError: undefined });

    const { result } = renderHook(() => useUsersData());

    await waitFor(() =>
      expect(result.current.loadError).toBe("用户列表返回为空，请稍后重试"),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("后台刷新失败保留旧列表，只提示一次，不把列表换成错误态", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetUsers.mockResolvedValueOnce(usersPage([1], 1));

    const { result } = renderHook(() => useUsersData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetUsers.mockRejectedValueOnce(new Error("refresh boom"));
    await act(async () => {
      await result.current.refreshInBackground();
    });

    expect(result.current.users.map((u) => u.id)).toEqual([1]);
    expect(result.current.loadError).toBeNull();
    expect(mockToastWarning).toHaveBeenCalledWith("列表刷新失败，请手动刷新");
    consoleWarn.mockRestore();
  });
});
