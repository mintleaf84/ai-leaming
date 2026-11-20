"use client";

import Link from "next/link";
import {
  ArrowRight,
  ListChecks,
  MoreHorizontal,
  Trash2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBeijingDate } from "@/lib/utils/datetime";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPaperKind, formatPaperSource, formatScore } from "../lib/format";
import type { ExamPaper } from "../lib/types";

interface PaperCardProps {
  paper: ExamPaper;
  onDelete: (paper: ExamPaper) => void;
}

/** 试卷列表卡片：整卡可点进预览，右上角是低频操作（删除） */
export function PaperCard({ paper, onDelete }: PaperCardProps) {
  const attempts = paper.attemptCount ?? 0;
  return (
    <article className="group relative rounded-xl border border-border bg-card transition-colors hover:border-primary/40 hover:shadow-sm">
      <Link
        href={`/exam/${paper.id}`}
        className="block rounded-xl p-4 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:p-5 md:pr-14"
      >
        <h3 className="text-base font-semibold leading-snug text-foreground md:text-lg">
          {paper.title}
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              paper.kind === "timed"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {formatPaperKind(paper)}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatPaperSource(paper.source)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {paper.totalQuestions} 题
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            {attempts > 0 ? `最好 ${formatScore(paper.bestScore)}` : "还没作答"}
          </span>
          {attempts > 0 && (
            <span>
              已练 {attempts} 次
              {paper.lastAttemptAt
                ? ` · 上次 ${formatBeijingDate(paper.lastAttemptAt, "M月D日")}`
                : ""}
            </span>
          )}
        </div>

        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          开始作答
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </Link>

      <div className="absolute right-2 top-2 md:right-3 md:top-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={`「${paper.title}」的更多操作`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/exam/${paper.id}`}>预览题目</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(paper)}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              删除试卷
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
