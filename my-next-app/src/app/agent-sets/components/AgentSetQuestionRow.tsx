"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSION_LABELS } from "@/types";
import { questionTypeLabel } from "@/app/exam/lib/format";
import { summarizeStem } from "../lib/display";
import type { AgentSetItem } from "../lib/types";

interface AgentSetQuestionRowProps {
  item: AgentSetItem;
  onFlag: (item: AgentSetItem) => void;
  /** 报错请求进行中：避免连点同一个按钮 */
  flagging?: boolean;
}

const TYPE_TAG_STYLES: Record<string, string> = {
  single: "bg-info-muted text-info",
  multi: "bg-primary/10 text-primary",
  truefalse: "bg-warning-muted text-warning",
  fill_blank: "bg-success-muted text-success",
};

/**
 * 题集详情里的一行题。
 *
 * 只给「看到什么题」的粒度：题干摘要 + 题型 + 考点，不展开选项、不给答案
 * （详情接口本身就不含答案）。右侧「这题有问题」是这一行唯一的操作，
 * 且必须经二次确认——它会把题从本批永久移走。
 */
export function AgentSetQuestionRow({
  item,
  onFlag,
  flagging = false,
}: AgentSetQuestionRowProps) {
  const { question, position } = item;
  const type = question.type ?? "single";
  const tags = (question.tags ?? []).slice(0, 3);

  return (
    <article className="flex items-start gap-3 border-t border-border/70 px-4 py-4 first:border-t-0 md:px-5">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-bold tabular-nums text-muted-foreground">
        {position}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-bold",
              TYPE_TAG_STYLES[type] ?? "bg-muted text-muted-foreground",
            )}
          >
            {questionTypeLabel(type)}
          </span>
          {question.dimension && (
            <span className="text-[11px] text-muted-foreground">
              {DIMENSION_LABELS[question.dimension] ?? question.dimension}
            </span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-foreground">
          {summarizeStem(question.content)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onFlag(item)}
        disabled={flagging}
        aria-label={`反馈第 ${position} 题有问题`}
        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:px-2"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">这题有问题</span>
      </button>
    </article>
  );
}
