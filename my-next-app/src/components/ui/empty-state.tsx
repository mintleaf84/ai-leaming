import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** 图标组件（来自 lucide-react） */
  icon?: React.ReactNode;
  /** 主标题 */
  title: string;
  /** 补充描述（可选） */
  description?: string;
  /** 操作按钮等额外内容（可选） */
  action?: React.ReactNode;
  /** 自定义 className */
  className?: string;
}

/**
 * 统一空状态占位组件
 * 替换全项目分散的"暂无数据"实现，保证 UI 一致性
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground/40">{icon}</div>}
      <p className="text-base font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground/70">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
