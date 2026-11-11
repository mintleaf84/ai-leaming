"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

/**
 * 路由级错误边界（App Router `error.tsx`）。
 *
 * 任何 page 段抛出的渲染/数据错误都会落到这里，而不是白屏；
 * `digest` 是 Next 生成的服务端错误指纹，用户报障时可直接对上日志。
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] 路由渲染失败", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <ErrorState
        title="页面出错了"
        description="渲染过程中出现异常，可以重试；若持续出现请把下方错误编号发给管理员。"
        digest={error.digest}
        onRetry={reset}
      />
    </div>
  );
}
