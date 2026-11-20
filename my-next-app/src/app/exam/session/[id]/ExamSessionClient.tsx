"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LayoutGrid,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useAppQuery } from "@/hooks/useAppQuery";
import { usePageBottomBar } from "@/components/layout/bottom-bar-slot";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAttempt, submitAttempt } from "../../lib/api";
import {
  buildAnswerSheet,
  collectAnswers,
  countUnanswered,
  type ExamDraft,
  type ExamDraftMap,
} from "../../lib/answer-sheet";
import {
  clearDeadline,
  clearDrafts,
  loadDeadline,
  loadDrafts,
  saveDeadline,
  saveDrafts,
} from "../../lib/draft-storage";
import {
  createClientKey,
  createSubmitGate,
  submitConfirmMessage,
} from "../../lib/submit";
import { AnswerSheet } from "../../components/AnswerSheet";
import { CountdownBadge } from "../../components/CountdownBadge";
import { ExamConfirmDialog } from "../../components/ExamConfirmDialog";
import { ExamQuestionCard } from "../../components/ExamQuestionCard";
import { useExamCountdown } from "../../hooks/use-countdown";
import { useUnsavedGuard } from "../../hooks/use-unsaved-guard";

interface ExamSessionClientProps {
  sessionId: string;
}

/**
 * 作答页。
 *
 * 三条关键约定（契约 §5）：
 * 1. 倒计时只认服务端 `deadlineAt`（契约只写在"开始作答"的返回里，这里同时
 *    接受 `GET /attempts/{id}` 的同名字段，刷新后可恢复）；
 * 2. 交卷前一定给出"还有 N 题没作答"的确认；倒计时归零则自动交卷**一次**；
 * 3. 未交卷离开要有提示（关标签页走 beforeunload，站内跳转走点击拦截）。
 *
 * 答案只在交卷时一次性提交，客户端不做判分 —— 判分的唯一实现在服务端
 * `checkAnswerCorrectness`，客户端再判一次只会多一套会漂移的规则。
 */
export default function ExamSessionClient({
  sessionId,
}: ExamSessionClientProps) {
  const router = useRouter();
  const {
    data: attempt,
    isLoading,
    isError,
    error,
    retry,
  } = useAppQuery({
    queryKey: ["exam-attempt", sessionId],
    queryFn: () => fetchAttempt(sessionId),
    // 作答数据必须每次进页面都重新取：缓存里可能还是"未交卷"的旧快照
    staleTime: 0,
  });

  // 草稿只存在本机（见 draft-storage 的注释）：首帧就能恢复，不必等接口
  const [drafts, setDrafts] = useState<ExamDraftMap>(() =>
    loadDrafts(sessionId),
  );
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const draftsRef = useRef<ExamDraftMap>(drafts);
  const durationsRef = useRef<Record<number, number>>({});
  const enteredAtRef = useRef<number>(0);
  const currentQuestionIdRef = useRef<number | null>(null);
  const clientKeyRef = useRef<string>("");
  const stemRef = useRef<HTMLHeadingElement | null>(null);
  const [gate] = useState(createSubmitGate);
  // 刷新后 deadline 可能在本地缓存里（见 draft-storage.saveDeadline 的注释）
  const [cachedDeadline] = useState<string | null>(() =>
    loadDeadline(sessionId),
  );

  const questions = useMemo(() => attempt?.questions ?? [], [attempt]);
  const current = questions[index];
  const serverDeadline = attempt?.deadlineAt ?? null;

  // 服务端给了新的 deadline 就更新本地缓存（供刷新后恢复）
  useEffect(() => {
    if (serverDeadline) saveDeadline(sessionId, serverDeadline);
  }, [serverDeadline, sessionId]);

  // 已交卷的链接不该还能改答案：直接去成绩单
  const alreadySubmitted = Boolean(attempt?.result);
  useEffect(() => {
    if (alreadySubmitted) router.replace(`/exam/result/${sessionId}`);
  }, [alreadySubmitted, router, sessionId]);

  // 计时：切到新题时把上一题的时长结算掉（只动 ref，不触发渲染）
  const flushDuration = useCallback(() => {
    const questionId = currentQuestionIdRef.current;
    if (questionId === null) return;
    const now = Date.now();
    durationsRef.current[questionId] =
      (durationsRef.current[questionId] ?? 0) +
      Math.max(0, now - enteredAtRef.current);
    enteredAtRef.current = now;
  }, []);

  useEffect(() => {
    currentQuestionIdRef.current = questions[index]?.id ?? null;
    enteredAtRef.current = Date.now();
  }, [questions, index]);

  const sheetCells = useMemo(
    () => buildAnswerSheet(questions, drafts, index),
    [questions, drafts, index],
  );
  const unanswered = useMemo(
    () => countUnanswered(questions, drafts),
    [questions, drafts],
  );
  const answered = questions.length - unanswered;

  const applyDraft = (questionId: number, draft: ExamDraft | undefined) => {
    const next: ExamDraftMap = { ...draftsRef.current };
    if (draft) next[questionId] = draft;
    else delete next[questionId];
    draftsRef.current = next;
    setDrafts(next);
    saveDrafts(sessionId, next);
  };

  const handleSelectOption = (letter: string) => {
    if (!current) return;
    applyDraft(current.id, { kind: "choice", letters: [letter] });
  };

  const handleToggleOption = (letter: string) => {
    if (!current) return;
    const existing = draftsRef.current[current.id];
    const letters = existing?.kind === "choice" ? existing.letters : [];
    const nextLetters = letters.includes(letter)
      ? letters.filter((item) => item !== letter)
      : [...letters, letter];
    applyDraft(
      current.id,
      nextLetters.length > 0
        ? { kind: "choice", letters: nextLetters }
        : undefined,
    );
  };

  const handleFillChange = (blanks: string[]) => {
    if (!current) return;
    applyDraft(current.id, { kind: "fill", blanks });
  };

  const submit = useCallback(async () => {
    if (!attempt || !gate.tryStart()) return;
    setConfirmOpen(false);
    setSubmitting(true);
    flushDuration();
    try {
      if (!clientKeyRef.current) clientKeyRef.current = createClientKey();
      const result = await submitAttempt(sessionId, {
        answers: collectAnswers(
          attempt.questions,
          draftsRef.current,
          durationsRef.current,
        ),
        clientKey: clientKeyRef.current,
      });
      clearDrafts(sessionId);
      clearDeadline(sessionId);
      setSubmitted(true);
      setSubmitting(false);
      toast.success(
        result.duplicate
          ? "这次作答已经交过卷，正在打开成绩单"
          : "已交卷，正在打开成绩单",
      );
      router.replace(`/exam/result/${sessionId}`);
    } catch (caught) {
      // 交卷失败必须放开闸门，否则用户再点"交卷"没有任何反应
      gate.reset();
      setSubmitting(false);
      const message =
        caught instanceof Error ? caught.message : "交卷失败，请稍后重试";
      console.error("[exam] 交卷失败", { sessionId, err: caught });
      toast.error("交卷失败", { description: message, duration: 10000 });
      return;
    }
  }, [attempt, flushDuration, gate, router, sessionId]);

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // 到点自动交卷：hook 内部保证只触发一次，闸门再兜一层（用户手点同时发生）
  const handleExpire = useCallback(() => {
    toast.warning("时间到，正在自动交卷");
    void submitRef.current();
  }, []);

  const countdown = useExamCountdown(
    serverDeadline ?? cachedDeadline,
    handleExpire,
  );

  useUnsavedGuard({
    active: !isLoading && !isError && !submitted,
    onBlocked: setPendingHref,
  });

  // 移动端有固定操作条（上一题/答题卡/下一题）：登记后 MobileNav 让位
  usePageBottomBar(!isLoading && !isError);

  const isLast = index === questions.length - 1;

  const goTo = (next: number) => {
    if (questions.length === 0) return;
    const clamped = Math.min(Math.max(0, next), questions.length - 1);
    if (clamped === index) return;
    flushDuration();
    setIndex(clamped);
    // 换题后把焦点交给新题干：读屏会立刻读出题目，键盘用户也不会留在旧按钮上
    requestAnimationFrame(() => stemRef.current?.focus());
  };

  const requestSubmit = () => {
    if (questions.length === 0) return;
    if (submitConfirmMessage(unanswered, questions.length)) {
      setConfirmOpen(true);
      return;
    }
    void submit();
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="mt-5 h-72 w-full rounded-xl" />
        <div className="mt-4 flex justify-between">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  if (isError || !attempt || !current) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
        <ErrorState
          title="作答页没加载出来"
          description={
            error?.message ??
            (attempt && !current ? "这份试卷里没有题目。" : undefined)
          }
          onRetry={retry}
        />
      </div>
    );
  }

  const confirmMessage =
    submitConfirmMessage(unanswered, questions.length) ?? "";

  return (
    <div className="min-h-dvh bg-background pb-28 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto w-full max-w-4xl px-4 py-3 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {attempt.paper.title}
              </p>
              <p className="text-xs text-muted-foreground">
                第 {index + 1} 题 / 共 {questions.length} 题
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CountdownBadge
                formatted={countdown.formatted}
                warning={countdown.warning}
                expired={countdown.expired}
                unlimited={countdown.remaining === null}
              />
              <Button
                size="sm"
                onClick={requestSubmit}
                disabled={submitting}
                className="hidden md:inline-flex"
              >
                {submitting && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                )}
                交卷
              </Button>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${
                    questions.length > 0
                      ? (answered / questions.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              已答 {answered} · 未答 {unanswered}
            </span>
          </div>
          <p className="sr-only" aria-live="polite">
            {countdown.announcement}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <ExamQuestionCard
              key={current.id}
              question={current}
              position={index + 1}
              draft={drafts[current.id]}
              onSelectOption={handleSelectOption}
              onToggleOption={handleToggleOption}
              onFillChange={handleFillChange}
              stemRef={stemRef}
            />

            <div className="hidden items-center justify-between gap-3 md:flex">
              <Button
                variant="outline"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                上一题
              </Button>
              {isLast ? (
                <Button
                  onClick={requestSubmit}
                  disabled={submitting}
                  className="gap-1"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  交卷
                </Button>
              ) : (
                <Button onClick={() => goTo(index + 1)} className="gap-1">
                  下一题
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  答题卡
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {answered}/{questions.length}
                </span>
              </div>
              <AnswerSheet cells={sheetCells} onJump={goTo} />
              <Button
                className="mt-4 w-full"
                onClick={requestSubmit}
                disabled={submitting}
              >
                交卷
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                交卷后统一判分
              </p>
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
          >
            上一题
          </Button>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="sm" className="flex-1 gap-1">
                <LayoutGrid className="h-4 w-4" aria-hidden />
                答题卡
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[75dvh] overflow-y-auto rounded-t-2xl"
            >
              <SheetHeader>
                <SheetTitle>答题卡</SheetTitle>
                <SheetDescription>
                  已答 {answered} 题，未答 {unanswered}{" "}
                  题。点题号可以直接跳过去。
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <AnswerSheet
                  cells={sheetCells}
                  onJump={(target) => {
                    goTo(target);
                    setSheetOpen(false);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>

          {isLast ? (
            <Button
              size="sm"
              className="flex-1"
              onClick={requestSubmit}
              disabled={submitting}
            >
              交卷
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => goTo(index + 1)}
            >
              下一题
            </Button>
          )}
        </div>
      </div>

      <ExamConfirmDialog
        open={confirmOpen}
        title="交卷确认"
        description={confirmMessage}
        confirmLabel={submitting ? "交卷中…" : "确定交卷"}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ExamConfirmDialog
        open={pendingHref !== null}
        title="还没交卷"
        description="离开后这次作答不会记分，也不会出现在练习记录里。确定要离开吗？"
        confirmLabel="离开"
        destructive
        onConfirm={() => {
          const href = pendingHref;
          setPendingHref(null);
          if (href) router.push(href);
        }}
        onCancel={() => setPendingHref(null)}
      />
    </div>
  );
}
