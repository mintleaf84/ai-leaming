"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookX,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  RotateCcw,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAttempt, startAttempt } from "../../lib/api";
import {
  formatAnswerText,
  formatDuration,
  formatOvertime,
  formatScore,
  questionTypeLabel,
} from "../../lib/format";

interface ExamResultClientProps {
  sessionId: string;
}

function scoreTone(percent: number): string {
  if (percent >= 85) return "text-success";
  if (percent >= 60) return "text-primary";
  return "text-destructive";
}

/**
 * 成绩单。
 *
 * 结果只读：分数、每题对错、正确答案与解析都来自服务端（重复交卷时服务端按
 * 已有作答重算，前端不做任何"再判一次"的动作）。错题在交卷时已写入错题本与
 * 掌握度，所以这里只提示一句，不再另做一套入口。
 *
 * 查询键与作答页分开（`exam-result` vs `exam-attempt`）：作答页的缓存里是
 * "未交卷"的快照，复用同一个键会先闪一下"还没交卷"。
 */
export default function ExamResultClient({ sessionId }: ExamResultClientProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const {
    data: detail,
    isLoading,
    isError,
    error,
    retry,
  } = useAppQuery({
    queryKey: ["exam-result", sessionId],
    queryFn: () => fetchAttempt(sessionId),
    staleTime: 0,
  });

  const retryExam = async () => {
    if (!detail) return;
    setRetrying(true);
    try {
      const attempt = await startAttempt(detail.paper.id);
      if (!attempt.sessionId) {
        toast.error("没有拿到新的作答会话，请稍后重试");
        return;
      }
      router.push(`/exam/session/${attempt.sessionId}`);
    } catch (caught) {
      // 再做一次失败：日志留痕 + 可见提示，停留原页
      console.error("[exam] 重新开始作答失败", {
        paperId: detail.paper.id,
        err: caught,
      });
      toast.error(
        caught instanceof Error ? caught.message : "开始作答失败，请稍后重试",
      );
      return;
    } finally {
      setRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <ErrorState
          title="成绩单没加载出来"
          description={error?.message}
          onRetry={retry}
        />
      </div>
    );
  }

  if (!detail.result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <h1 className="text-2xl font-bold text-foreground">还没交卷</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          这次作答还没有交卷，回去把卷子做完就能看到成绩。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/exam/session/${sessionId}`}>继续作答</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/exam">返回试卷列表</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { paper, result, questions, answers } = detail;
  const percent = Math.round(result.score * 100);
  const wrongCount = result.perQuestion.filter(
    (item) => !item.isCorrect,
  ).length;
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const answerById = new Map(
    (answers ?? []).map((entry) => [entry.questionId, entry.userAnswer ?? ""]),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/exam"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        全部试卷
      </Link>

      <header className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          成绩单
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-foreground md:text-3xl">
          {paper.title}
        </h1>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-5xl font-bold tabular-nums leading-none md:text-6xl",
                  scoreTone(percent),
                )}
              >
                {percent}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                分
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              答对 {result.correctCount} / {result.totalQuestions} 题 · 正确率{" "}
              {percent}%
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              用时 {formatDuration(result.durationMs)}
            </span>
            {result.overtime ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-muted px-2.5 py-1 font-medium text-warning">
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {formatOvertime(result.overtimeMs)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-muted px-2.5 py-1 text-success">
                按时交卷
              </span>
            )}
          </div>
        </div>

        {result.duplicate && (
          <p className="mt-3 text-xs text-muted-foreground">
            这次交卷是重复提交，成绩以第一次交卷为准。
          </p>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {wrongCount > 0 && (
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/wrong-book">
              <BookX className="h-4 w-4" aria-hidden />
              错题重练（{wrongCount} 题）
            </Link>
          </Button>
        )}
        <Button
          onClick={() => void retryExam()}
          disabled={retrying}
          className="gap-1.5"
        >
          {retrying ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden />
          )}
          再做一次
        </Button>
        <Button asChild variant="ghost">
          <Link href="/exam">返回列表</Link>
        </Button>
      </div>

      {wrongCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          答错的 {wrongCount} 道题已自动加入错题本，掌握度也会跟着更新。
        </p>
      )}

      <section aria-label="逐题解析" className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">
          逐题解析 · 共 {result.totalQuestions} 题
        </h2>
        <ol className="mt-3 space-y-2.5">
          {result.perQuestion.map((entry, index) => {
            const question = questionById.get(entry.questionId);
            return (
              <li
                key={`${entry.questionId}-${index}`}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  entry.isCorrect ? "border-border" : "border-destructive/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      entry.isCorrect
                        ? "bg-success-muted text-success"
                        : "bg-destructive/10 text-destructive",
                    )}
                    aria-hidden
                  >
                    {entry.isCorrect ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        第 {index + 1} 题
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-semibold",
                          entry.isCorrect
                            ? "bg-success-muted text-success"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {entry.isCorrect ? "答对" : "答错"}
                      </span>
                      <span>{questionTypeLabel(question?.type)}</span>
                    </div>

                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                      {question?.content ?? `题目 #${entry.questionId}`}
                    </p>

                    <dl className="mt-3 space-y-1 text-sm">
                      {/*
                        只有服务端真的回了这道题的作答记录才画「我的作答」：
                        `answers` 在契约里是可选的，缺省时不能把每道题都说成"未作答"。
                      */}
                      {answerById.has(entry.questionId) && (
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-muted-foreground">
                            我的作答
                          </dt>
                          <dd
                            className={cn(
                              "min-w-0 break-words",
                              entry.isCorrect
                                ? "text-foreground"
                                : "text-destructive",
                            )}
                          >
                            {formatAnswerText(answerById.get(entry.questionId))}
                          </dd>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">
                          正确答案
                        </dt>
                        <dd className="min-w-0 break-words font-medium text-success">
                          {entry.correctAnswer
                            ? formatAnswerText(entry.correctAnswer)
                            : "—"}
                        </dd>
                      </div>
                    </dl>

                    {entry.explanation && (
                      <div className="mt-2.5 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                        {entry.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        本次得分 {formatScore(result.score)} · 正确率 {percent}% · 用时{" "}
        {formatDuration(result.durationMs)}
      </p>
    </div>
  );
}
