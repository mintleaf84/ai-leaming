"use client";

import { cn } from "@/lib/utils";
import type { SheetCell } from "../lib/answer-sheet";

interface AnswerSheetProps {
  cells: SheetCell[];
  /** 跳到第 index 题（0 起） */
  onJump: (index: number) => void;
  className?: string;
}

const LEGEND = [
  { label: "当前", className: "ring-2 ring-primary bg-card text-primary" },
  { label: "已答", className: "bg-primary text-primary-foreground" },
  {
    label: "未答",
    className: "border border-border bg-card text-muted-foreground",
  },
];

/**
 * 答题卡：网格里的每个数字都是跳转按钮。
 *
 * 状态完全由草稿派生（`buildAnswerSheet`），组件不额外记"哪些题答过"，
 * 否则草稿更新与卡片状态会出现两条真相。
 */
export function AnswerSheet({ cells, onJump, className }: AnswerSheetProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-5 gap-2">
        {cells.map((cell) => (
          <button
            key={cell.questionId}
            type="button"
            onClick={() => onJump(cell.position - 1)}
            aria-current={cell.isCurrent ? "step" : undefined}
            aria-label={`第 ${cell.position} 题，${
              cell.status === "answered" ? "已作答" : "未作答"
            }${cell.isCurrent ? "，当前题" : ""}`}
            className={cn(
              "flex h-9 items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              cell.status === "answered"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
              cell.isCurrent &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            {cell.position}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-3 w-3 rounded-sm", item.className)}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
