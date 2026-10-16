"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * React Query 全局 Provider。
 * 在客户端创建 QueryClient 实例，避免服务端渲染时多请求间共享状态。
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  // 在 useState 中初始化，确保每个客户端连接只创建一个实例
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 数据在 1 分钟内被视为"新鲜"，不会重新请求
            staleTime: 60 * 1000,
            // 请求失败时最多重试 1 次
            retry: 1,
            // 窗口重新聚焦时不自动刷新（可按需开启）
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
