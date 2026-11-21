"use client";

import { AlertTriangle, Clock, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownBadgeProps {
  /** 格式化后的剩余时间（`mm:ss` / `--:--`） */
  formatted: string;
  warning?: boolean;
  expired?: boolean;
  /** 不限时：显示"不限时"而不是 `--:--` */
  unlimited?: boolean;
  className?: string;
}

/**
 * 试卷倒计时胶囊。
 *
 * 只负责"长得像计时器"和临界的视觉提示；时间本身来自 `useExamCountdown`，
 * 不在组件里自走一份（否则刷新/切后台两边会对不上）。
 */
export function CountdownBadge({
  formatted,
  warning = false,
  expired = false,
  unlimited = false,
  className,
}: CountdownBadgeProps) {
  return (
    <div
      role="timer"
      aria-label={unlimited ? "不限时" : "剩余时间"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
        expired
          ? "bg-destructive/15 text-destructive"
          : warning
            ? "bg-warning-muted text-warning-foreground animate-pulse"
            : "bg-muted text-foreground",
        className,
      )}
    >
      {unlimited ? (
        <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
      ) : expired || warning ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Clock className="h-3.5 w-3.5 opacity-70" aria-hidden />
      )}
      <span aria-hidden>{unlimited ? "不限时" : formatted}</span>
    </div>
  );
}
