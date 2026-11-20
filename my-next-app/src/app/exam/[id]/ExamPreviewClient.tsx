"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  EyeOff,
  Loader2,
  ListChecks,
  Play,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBeijingDate } from "@/lib/utils/datetime";
import { useAppQuery } from "@/hooks/useAppQuery";
import { usePageBottomBar } from "@/components/layout/bottom-bar-slot";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DIMENSION_LABELS } from "@/types";
import { fetchPaperDetail, startAttempt } from "../lib/api";
import { saveDeadline } from "../lib/draft-storage";
import {
  formatPaperKind,
  formatPaperSource,
  formatScore,
  questionTypeLabel,
} from "../lib/format";

interface ExamPreviewClientProps {
  paperId: number;
}

/**
 * 试卷预览：题目清单 + 开始作答。
 *
 * 预览**不渲染答案与解析**：契约里 `GET /papers/{id}` 会把 `answer` 带回来
 * （防作弊只约束作答态），但用户在"看一眼试卷"的阶段不该看到答案，所以这里
 * 只画题干、题型与考点。
 */
export default function ExamPreviewClient({ paperId }: ExamPreviewClientProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const invalidId = !Number.isFinite(paperId) || paperId <= 0;

  const {
    data: detail,
    isLoading,
    isError,
    error,
    retry,
  } = useAppQuery({
    queryKey: ["exam-paper", paperId],
    queryFn: () => fetchPaperDetail(paperId),
    enabled: !invalidId,
  });

  // 预览页所有断点都有底部主操作条：登记后让 MobileNav 让位
  usePageBottomBar(true);

  const start = async () => {
    setStarting(true);
    try {
      const attempt = await startAttempt(paperId);
      if (!attempt.sessionId) {
        toast.error("这次没有拿到作答会话，请稍后重试");
        return;
      }
      // 把服务端给的 deadline 一起带走：作答页刷新后靠它恢复倒计时
      saveDeadline(attempt.sessionId, attempt.deadlineAt ?? null);
      router.push(`/exam/session/${attempt.sessionId}`);
    } catch (caught) {
      // 转换提示：开始作答失败要给用户一句能行动的话，同时留日志便于排查
      console.error("[exam] 开始作答失败", { paperId, err: caught });
      toast.error(
        caught instanceof Error ? caught.message : "开始作答失败，请稍后重试",
      );
      return;
    } finally {
      setStarting(false);
    }
  };

  if (invalidId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <p className="text-base font-medium text-foreground">
            试卷地址不正确
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            链接里的试卷编号不是有效数字，回到列表重新选一份。
          </p>
          <Button asChild className="mt-4">
            <Link href="/exam">返回试卷列表</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-9 w-2/3" />
        <Skeleton className="mt-3 h-4 w-40" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <ErrorState
          title="试卷没加载出来"
          description={error?.message}
          onRetry={retry}
        />
        <div className="text-center">
          <Link
            href="/exam"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            返回试卷列表
          </Link>
        </div>
      </div>
    );
  }

  const { paper, items, lastAttempt } = detail;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 md:px-8 md:pb-12 md:pt-10">
      <Link
        href="/exam"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        全部试卷
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
          {paper.title}
        </h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              paper.kind === "timed"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Timer className="h-3 w-3" aria-hidden />
            {formatPaperKind(paper)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            <ListChecks className="h-3 w-3" aria-hidden />
            {paper.totalQuestions} 题
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            {formatPaperSource(paper.source)}
          </span>
          {paper.createdAt && (
            <span className="text-muted-foreground">
              创建于 {formatBeijingDate(paper.createdAt, "YYYY/M/D")}
            </span>
          )}
        </div>
      </header>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-info/30 bg-info-muted/50 p-3.5 text-sm text-foreground">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <p>
          预览只显示题目，不显示答案。作答并交卷后，可以看到每道题的对错、正确答案与解析。
        </p>
      </div>

      {lastAttempt?.sessionId && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
          <span className="text-muted-foreground">
            上次作答成绩{" "}
            <strong className="font-semibold text-foreground">
              {formatScore(lastAttempt.score)}
            </strong>
            {lastAttempt.submittedAt &&
              ` · ${formatBeijingDate(lastAttempt.submittedAt, "M月D日 HH:mm")}`}
          </span>
          <Link
            href={`/exam/result/${lastAttempt.sessionId}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            查看成绩单
          </Link>
        </div>
      )}

      <section aria-label="题目清单" className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">
          共 {items.length} 题
        </h2>
        <ol className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li
              key={`${item.position}-${item.question.id}`}
              className="rounded-xl border border-border bg-card p-3.5 md:p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1.5 font-mono text-xs font-bold tabular-nums text-muted-foreground">
                  {item.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                      {questionTypeLabel(item.question.type)}
                    </span>
                    {item.question.dimension && (
                      <span>
                        {DIMENSION_LABELS[item.question.dimension] ??
                          item.question.dimension}
                      </span>
                    )}
                    {(item.question.material ||
                      item.question.material_html) && <span>含材料</span>}
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground">
                    {item.question.content}
                  </p>
                  {item.question.tags && item.question.tags.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.question.tags.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:static md:mt-8 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="hidden text-sm text-muted-foreground sm:block">
            共 {paper.totalQuestions} 题 · {formatPaperKind(paper)}
          </p>
          <Button
            onClick={() => void start()}
            disabled={starting || items.length === 0}
            className="w-full gap-2 sm:w-auto sm:min-w-40"
            size="lg"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {starting ? "正在开始…" : "开始作答"}
          </Button>
        </div>
      </div>
    </div>
  );
}
