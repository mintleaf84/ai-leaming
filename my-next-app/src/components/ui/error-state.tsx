"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  /** 主标题 */
  title?: string;
  /** 具体原因（可来自 Error.message） */
  description?: string;
  /** 重试回调：必填 —— 错误状态必须给出可执行的恢复动作 */
  onRetry: () => void;
  /** 错误摘要 ID，方便用户报障时对应日志 */
  digest?: string;
  /** 自定义 className */
  className?: string;
}

/**
 * 统一错误状态占位组件。
 *
 * 与 `EmptyState`（无数据）区分：这里表示"本该有数据但加载失败"，
 * 因此必须给出可执行的下一步（重试 / 返回），而不是只显示一句话。
 */
export function ErrorState({
  title = "加载失败",
  description = "请求没有成功，请稍后重试。",
  onRetry,
  digest,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
        重试
      </Button>
      {digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/60">
          错误编号：{digest}
        </p>
      )}
    </div>
  );
}

export default ErrorState;
