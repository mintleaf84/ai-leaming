"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiKeysAction } from "@/server/actions/api-keys";
import type { ApiKeyView } from "@/types/api-key";

/**
 * API Key 管理页的取数层：密钥列表 + 三态。
 *
 * 只负责「拿数据 / 刷新 / 落地错误」，不含创建对话框与任何渲染。
 * 写操作成功后由动作层调用 `reload()`；与拆分前一致，刷新期间列表会切回骨架态
 * （每次成功操作恰好刷新一次，不多请求）。
 *
 * 页头的两个计数由列表派生（同一份数据，不额外请求）。
 */
export function useApiKeysData() {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getApiKeysAction();
    // safe-action 不抛错：serverError 与空 data 都算加载失败
    if (result.serverError || !result.data) {
      setLoadError(result.serverError ?? "密钥列表返回为空，请稍后重试");
      setLoading(false);
      return;
    }
    setKeys(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchKeys();
  }, [fetchKeys]);

  const activeCount = keys.filter((k) => k.is_active).length;
  const globalCount = keys.filter((k) => k.user_id === null).length;

  return {
    keys,
    loading,
    loadError,
    activeCount,
    globalCount,
    /** 重新加载（首屏 / 错误态重试 / 写操作成功后） */
    reload: fetchKeys,
  };
}

export type UseApiKeysDataResult = ReturnType<typeof useApiKeysData>;
