import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- 稳定的 mock 引用（hoisted，模块工厂里只能用它们） ---
const {
  mockGetApiKeys,
  mockCreateApiKey,
  mockToggleApiKey,
  mockDeleteApiKey,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockGetApiKeys: vi.fn(),
  mockCreateApiKey: vi.fn(),
  mockToggleApiKey: vi.fn(),
  mockDeleteApiKey: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("@/server/actions/api-keys", () => ({
  getApiKeysAction: mockGetApiKeys,
  createApiKeyAction: mockCreateApiKey,
  toggleApiKeyAction: mockToggleApiKey,
  deleteApiKeyAction: mockDeleteApiKey,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useApiKeysData } from "../use-api-keys-data";
import { useApiKeysActions } from "../use-api-keys-actions";

/** 打码后的列表行：真实接口从不返回明文 */
const maskedRow = (id: number) => ({
  id,
  key_string: `sk_abc123••••••••${id}xyz`,
  description: `key-${id}`,
  is_active: 1,
  user_id: null,
  scopes: "read",
  last_used_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

const renderPageHooks = () =>
  renderHook(() => {
    const data = useApiKeysData();
    const actions = useApiKeysActions(data);
    return { data, actions };
  });

describe("useApiKeysActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKeys.mockResolvedValue({
      data: [maskedRow(1)],
      serverError: undefined,
    });
  });

  it("创建成功：明文落地一次、对话框关闭、表单重置、列表恰好刷新一次", async () => {
    mockCreateApiKey.mockResolvedValue({
      data: { success: true, key: "sk_plain_only_once" },
      serverError: undefined,
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    act(() => {
      result.current.actions.openCreateDialog();
      result.current.actions.setDescription("  Coze 接入  ");
      result.current.actions.setScope("write");
      result.current.actions.setOwnerId("12");
    });

    await act(async () => {
      await result.current.actions.handleCreate();
    });

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      description: "Coze 接入",
      scopes: "write",
      userId: 12,
    });
    // 一次性明文：只在这里出现
    expect(result.current.actions.createdKey).toEqual({
      key: "sk_plain_only_once",
      scope: "write",
      userId: 12,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "密钥已生成，只显示这一次，请立即复制",
    );
    // 对话框关掉、表单回到默认值
    expect(result.current.actions.createOpen).toBe(false);
    expect(result.current.actions.description).toBe("");
    expect(result.current.actions.scope).toBe("read");
    expect(result.current.actions.ownerId).toBe("");
    // 首屏 1 次 + 创建成功后 1 次，不多请求
    expect(mockGetApiKeys).toHaveBeenCalledTimes(2);
  });

  it("创建失败：错误留在对话框里，不写明文、不刷新列表", async () => {
    mockCreateApiKey.mockResolvedValue({
      data: undefined,
      serverError: "密钥写库失败",
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    act(() => {
      result.current.actions.openCreateDialog();
      result.current.actions.setDescription("给第三方用");
    });

    await act(async () => {
      await result.current.actions.handleCreate();
    });

    expect(result.current.actions.createError).toBe("密钥写库失败");
    expect(result.current.actions.createOpen).toBe(true);
    expect(result.current.actions.createdKey).toBeNull();
    // 失败不刷新（列表已经是可用状态）
    expect(mockGetApiKeys).toHaveBeenCalledTimes(1);
    expect(result.current.data.loadError).toBeNull();
  });

  it("一次性明文不会随刷新再现：列表接口只有打码值，重开对话框即清空", async () => {
    mockCreateApiKey.mockResolvedValue({
      data: { success: true, key: "sk_plain_only_once" },
      serverError: undefined,
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    act(() => {
      result.current.actions.openCreateDialog();
      result.current.actions.setDescription("一次性");
    });

    await act(async () => {
      await result.current.actions.handleCreate();
    });

    // 刷新后列表里只有打码值，明文不可能被「重新取回来」
    expect(result.current.data.keys).toHaveLength(1);
    expect(result.current.data.keys[0].key_string).toBe(
      maskedRow(1).key_string,
    );
    expect(result.current.data.keys[0].key_string).not.toBe(
      "sk_plain_only_once",
    );

    // 关闭提示条 → 明文消失
    act(() => {
      result.current.actions.clearCreatedKey();
    });
    expect(result.current.actions.createdKey).toBeNull();

    // 再生成一把：明文只可能来自 create 的返回值
    act(() => {
      result.current.actions.openCreateDialog();
      result.current.actions.setDescription("第二把");
    });
    await act(async () => {
      await result.current.actions.handleCreate();
    });
    expect(result.current.actions.createdKey?.key).toBe("sk_plain_only_once");

    // 再次打开创建对话框 → 上一把的明文不会带回来
    act(() => {
      result.current.actions.openCreateDialog();
    });
    expect(result.current.actions.createdKey).toBeNull();
  });

  it("全权档强制为全局 key（不提交绑定用户）", async () => {
    mockCreateApiKey.mockResolvedValue({
      data: { success: true, key: "sk_admin" },
      serverError: undefined,
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    act(() => {
      result.current.actions.openCreateDialog();
      result.current.actions.setDescription("站长自用");
      result.current.actions.setOwnerId("5");
      result.current.actions.setScope("admin");
    });

    expect(result.current.actions.effectiveOwnerId).toBeNull();

    await act(async () => {
      await result.current.actions.handleCreate();
    });

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      description: "站长自用",
      scopes: "admin",
      userId: null,
    });
    expect(result.current.actions.createdKey?.userId).toBeNull();
  });

  it("停用动作后刷新一次列表", async () => {
    mockToggleApiKey.mockResolvedValue({
      data: { success: true },
      serverError: undefined,
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleToggle(1, 1);
    });

    expect(mockToggleApiKey).toHaveBeenCalledWith({ id: 1, isActive: false });
    expect(mockGetApiKeys).toHaveBeenCalledTimes(2);
  });

  it("删除：确认后删一次并刷新；取消时一个请求都不发", async () => {
    mockDeleteApiKey.mockResolvedValue({
      data: { success: true },
      serverError: undefined,
    });

    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await act(async () => {
      await result.current.actions.handleDelete(1);
    });
    expect(mockDeleteApiKey).not.toHaveBeenCalled();
    expect(mockGetApiKeys).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValueOnce(true);
    await act(async () => {
      await result.current.actions.handleDelete(1);
    });
    expect(mockDeleteApiKey).toHaveBeenCalledWith(1);
    expect(mockGetApiKeys).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it("行可见性只改视图态，不触发取数", async () => {
    const { result } = renderPageHooks();
    await waitFor(() => expect(result.current.data.loading).toBe(false));

    act(() => {
      result.current.actions.toggleVisibility(1);
    });
    expect(result.current.actions.visibleKeys.has(1)).toBe(true);

    act(() => {
      result.current.actions.toggleVisibility(1);
    });
    expect(result.current.actions.visibleKeys.has(1)).toBe(false);
    expect(mockGetApiKeys).toHaveBeenCalledTimes(1);
  });
});
