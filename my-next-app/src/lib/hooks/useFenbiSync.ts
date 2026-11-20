"use client";

import { useCallback, useState } from "react";

import { useAppQuery } from "@/hooks/useAppQuery";

/**
 * 粉笔账号同步的数据层（Web / App 共用同一套接口，见 docs/fenbi-sync-design.md §5）。
 *
 * 这里只做三件事：
 * 1. 把接口返回的 JSON 钉成类型（后端字段沿用设计文档，不改名）；
 * 2. 把"请求失败"翻译成可以直接展示给用户的中文（风控 430 单独给可操作文案）；
 * 3. 提供状态查询 + 立即同步 / 解绑 的动作封装，让组件只关心渲染。
 *
 * 注意：后端接口本分支尚未合并，请求失败属于正常态，组件必须能优雅降级。
 */

/** 同步失败的单条记录。`type === 1` 是试卷/模考记录，粉笔暂未开放。 */
export interface FenbiFailedItem {
  type?: number;
  exerciseId?: string | number;
  title?: string;
  reason?: string;
}

export interface FenbiSyncResult {
  imported: number;
  skipped: number;
  newQuestions: number;
  failed?: FenbiFailedItem[];
  finishedAt?: string;
}

export interface FenbiStatus {
  linked: boolean;
  /** 后端已掩码，形如 138****8000 */
  phoneMasked: string | null;
  fenbiUserId?: string | number | null;
  lastSyncAt: string | null;
  lastResult: FenbiSyncResult | null;
  syncable?: boolean;
  unsupported?: string[];
}

export type FenbiQrcodeState = "pending" | "scanned" | "confirmed" | "expired";

export interface FenbiQrcodeTicket {
  lgtoken: string;
  qrContent: string;
}

export const FENBI_STATUS_QUERY_KEY = ["fenbi-status"] as const;

/**
 * 粉笔风控的可操作文案。
 *
 * 后端返回 HTTP 430（阿里云滑块）时，原样展示"430"对用户毫无意义，
 * 用户只会反复点击——而反复尝试会让风控时间变长。所以这里固定给"等 10 分钟 + 换扫码"。
 */
export const FENBI_RISK_CONTROL_MESSAGE =
  "粉笔检测到异常登录，已暂时限制这台设备的登录。请等 10 分钟后再试，或者改用扫码绑定（更稳）。";

const FENBI_RATE_LIMIT_MESSAGE = "操作太频繁了，请等 1 分钟后再试。";
const FENBI_NETWORK_MESSAGE = "网络连接失败，请检查网络后重试。";
const FENBI_GENERIC_MESSAGE = "操作没有成功，请稍后重试。";

interface RequestError extends Error {
  status?: number;
}

function createRequestError(message: string, status: number): RequestError {
  const error = new Error(message) as RequestError;
  error.status = status;
  return error;
}

/**
 * 解析响应体；非 JSON（网关错误页、204 等）返回 null，交给调用方走兜底文案。
 */
async function readJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // audit-allow: 非 JSON 响应（网关错误页等）不是错误，按"无响应体"处理
    return null;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw createRequestError(FENBI_NETWORK_MESSAGE, 0);
  }

  const payload = await readJsonOrNull(response);

  if (!response.ok) {
    const record = (payload ?? {}) as { error?: unknown; message?: unknown };
    const text =
      (typeof record.error === "string" && record.error.trim()) ||
      (typeof record.message === "string" && record.message.trim()) ||
      "";
    throw createRequestError(text || FENBI_GENERIC_MESSAGE, response.status);
  }

  return (payload ?? {}) as T;
}

/**
 * 把任意错误翻译成一句用户能照做的话。
 *
 * 优先级：风控 / 限频（自己给文案）> 后端给的中文 error（粉笔原始报错更有信息量）> 兜底。
 */
export function describeFenbiError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as RequestError).status)
      : undefined;

  const looksLikeRiskControl =
    status === 430 || /风控|滑块|验证码|430/.test(message);

  if (status === 429) return FENBI_RATE_LIMIT_MESSAGE;
  if (looksLikeRiskControl) return FENBI_RISK_CONTROL_MESSAGE;
  if (message) return message;
  return FENBI_GENERIC_MESSAGE;
}

function normalizeResult(value: unknown): FenbiSyncResult | null {
  if (!value) return null;
  // 后端可能把 last_sync_result 以 JSON 字符串落库后原样返回
  if (typeof value === "string") {
    try {
      return normalizeResult(JSON.parse(value));
    } catch {
      // audit-allow: 历史列的脏数据（非 JSON 文本）按"无同步结果"处理
      return null;
    }
  }
  if (typeof value !== "object") return null;
  const record = value as Partial<FenbiSyncResult>;
  return {
    imported: Number(record.imported ?? 0),
    skipped: Number(record.skipped ?? 0),
    newQuestions: Number(record.newQuestions ?? 0),
    failed: Array.isArray(record.failed) ? record.failed : [],
    finishedAt:
      typeof record.finishedAt === "string" ? record.finishedAt : undefined,
  };
}

function normalizeStatus(payload: FenbiStatus): FenbiStatus {
  return {
    linked: Boolean(payload.linked),
    phoneMasked:
      typeof payload.phoneMasked === "string" && payload.phoneMasked.trim()
        ? payload.phoneMasked
        : null,
    fenbiUserId: payload.fenbiUserId ?? null,
    lastSyncAt: payload.lastSyncAt ?? null,
    lastResult: normalizeResult(payload.lastResult),
    syncable: payload.syncable,
    unsupported: Array.isArray(payload.unsupported) ? payload.unsupported : [],
  };
}

/** 账号绑定状态（一个查询入口，页面直接用 useAppQuery 的四态约定渲染）。 */
export function useFenbiStatus() {
  const query = useAppQuery<FenbiStatus>({
    queryKey: FENBI_STATUS_QUERY_KEY,
    queryFn: async () =>
      normalizeStatus(await requestJson<FenbiStatus>("/api/fenbi/status")),
    staleTime: 30_000,
    retry: 1,
  });

  return query;
}

export type SyncOutcome =
  { ok: true; result: FenbiSyncResult } | { ok: false; message: string };

export interface UseFenbiSyncResult {
  status: FenbiStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  retry: () => void;
  refetch: () => Promise<unknown>;
  isSyncing: boolean;
  isUnlinking: boolean;
  /** 最近一次动作失败的原因，用于卡片内联展示（toast 之外的第二落点） */
  actionError: string | null;
  runSync: () => Promise<SyncOutcome>;
  unlink: () => Promise<SyncOutcome>;
  clearActionError: () => void;
}

/** 状态查询 + 立即同步 / 解绑。 */
export function useFenbiSync(): UseFenbiSyncResult {
  const { data, isLoading, isError, error, retry, refetch } = useFenbiStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const runSync = useCallback(async (): Promise<SyncOutcome> => {
    setIsSyncing(true);
    setActionError(null);
    try {
      const result = await requestJson<FenbiSyncResult>("/api/fenbi/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refetch();
      return {
        ok: true,
        result: {
          imported: Number(result.imported ?? 0),
          skipped: Number(result.skipped ?? 0),
          newQuestions: Number(result.newQuestions ?? 0),
          failed: Array.isArray(result.failed) ? result.failed : [],
          finishedAt: result.finishedAt,
        },
      };
    } catch (error) {
      // audit-allow: 错误转成 actionError 并随返回值交给调用方展示
      const message = describeFenbiError(error);
      setActionError(message);
      return { ok: false, message };
    } finally {
      setIsSyncing(false);
    }
  }, [refetch]);

  const unlink = useCallback(async (): Promise<SyncOutcome> => {
    setIsUnlinking(true);
    setActionError(null);
    try {
      await requestJson<{ ok?: boolean }>("/api/fenbi/link", {
        method: "DELETE",
      });
      await refetch();
      return { ok: true, result: { imported: 0, skipped: 0, newQuestions: 0 } };
    } catch (error) {
      // audit-allow: 解绑失败转成 actionError，由界面展示并可重试
      const message = describeFenbiError(error);
      setActionError(message);
      return { ok: false, message };
    } finally {
      setIsUnlinking(false);
    }
  }, [refetch]);

  return {
    status: data,
    isLoading,
    isError,
    error,
    retry,
    refetch,
    isSyncing,
    isUnlinking,
    actionError,
    runSync,
    unlink,
    clearActionError,
  };
}

/** 用手机号 + 密码绑定。失败时把后端中文 error 抛给调用方展示。 */
export async function linkFenbiAccount(input: {
  phone: string;
  password: string;
}): Promise<void> {
  await requestJson<{ ok?: boolean }>("/api/fenbi/link", {
    method: "POST",
    body: JSON.stringify({ phone: input.phone, password: input.password }),
  });
}

/** 申请一张扫码登录用的二维码。 */
export async function createFenbiQrcode(): Promise<FenbiQrcodeTicket> {
  const payload = await requestJson<Partial<FenbiQrcodeTicket>>(
    "/api/fenbi/qrcode",
    {
      method: "POST",
    },
  );
  if (!payload.lgtoken || !payload.qrContent) {
    throw createRequestError("二维码没有生成成功，请重新获取。", 0);
  }
  return { lgtoken: payload.lgtoken, qrContent: payload.qrContent };
}

function normalizeQrcodeState(value: unknown): FenbiQrcodeState {
  if (value === "scanned" || value === "confirmed" || value === "expired") {
    return value;
  }
  return "pending";
}

/** 查询扫码状态。后端约定 `{ status }`，兼容包一层 `data` 的写法。 */
export async function fetchFenbiQrcodeState(
  lgtoken: string,
): Promise<FenbiQrcodeState> {
  const payload = await requestJson<{
    status?: unknown;
    data?: { status?: unknown };
  }>(`/api/fenbi/qrcode/status?lgtoken=${encodeURIComponent(lgtoken)}`);
  return normalizeQrcodeState(payload.status ?? payload.data?.status);
}
