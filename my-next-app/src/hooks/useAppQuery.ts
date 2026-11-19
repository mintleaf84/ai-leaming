"use client";

import { useCallback } from "react";
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

/**
 * 应用内唯一的查询入口。
 *
 * 为什么不让页面直接 `useQuery`：React Query 的返回值里 `data` 在"请求中"、
 * "请求失败"、"真的没有数据" 三种情况下都是 `undefined`。页面若只判断
 * `data.length === 0`，接口 500 就会被渲染成"暂无数据"——用户会以为是自己
 * 的数据没了，而不是服务挂了（W1 事故的根因）。
 *
 * 本 hook 把四态语义钉死，页面只需要按固定顺序渲染：
 *
 * ```tsx
 * if (isLoading) return <Skeleton />;        // 1. 加载中（首次，无数据）
 * if (isError) return <ErrorState onRetry={retry} />;  // 2. 失败（可恢复）
 * if (data.length === 0) return <EmptyState />;        // 3. 真的没有数据
 * return <List data={data} />;                         // 4. 有数据
 * ```
 *
 * 约定：
 * - `isLoading` 只在"首次加载且没有任何数据"时为 true；重试时不会闪骨架屏
 *   （React Query 的 `isLoading === isPending && isFetching`，这里直接透传）。
 * - `isError` 表示这次查询最终失败；`error` 必定是 `Error` 实例或 `null`。
 * - `retry` 是给 `ErrorState.onRetry` 用的：`() => void`，内部就是 refetch，
 *   不抛异常（ErrorState 是按钮回调，返回 Promise 会变成未处理的 rejection）。
 */
export interface AppQueryResult<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** 重试：等价于 refetch，返回 void，可直接接 ErrorState 的 onRetry */
  retry: () => void;
  /** 原始 refetch（需要 await 或读取结果时用） */
  refetch: UseQueryResult<TData, Error>["refetch"];
}

export function useAppQuery<TData, TKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, Error, TData, TKey>,
): AppQueryResult<TData> {
  const query = useQuery<TData, Error, TData, TKey>(options);
  const { refetch } = query;

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    retry,
    refetch,
  };
}

export default useAppQuery;
