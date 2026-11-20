"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Flag,
  Loader2,
  LogOut,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExamQuestionCard } from "@/app/exam/components/ExamQuestionCard";
import {
  draftToUserAnswer,
  isDraftAnswered,
  type ExamDraft,
} from "@/app/exam/lib/answer-sheet";
import { flagAgentSetQuestion, submitAgentSetAnswer } from "../lib/api";
import { progressPercent } from "../lib/stats";
import type { AgentSetItem } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { FlagDialog } from "./FlagDialog";

interface PracticeRunnerProps {
  setId: number;
  sessionId: string;
  questions: AgentSetItem[];
  /** 退出练习：回到题集并刷新 */
  onExit: () => void;
}

/**
 * 题集内的逐题练习。
 *
 * 与练习页同一套交互语义：**选完立刻判分**（单选/判断点选项即提交，多选/填空点
 * 「确认提交」），判分只发生在服务端——这里调 `POST /practice/session/{id}/submit`，
 * 客户端不复刻任何判分规则。
 *
 * 为什么不直接跳 `/practice`：练习页的会话来自 `/practice/session` 的随机/错题
 * 抽取，而题集必须固定「这一批的这几道题」；共享的是题面组件、判分接口与记录
 * （练习记录、错题本），不是页面。
 *
 * 答完不跳新页面，就地给本轮小结，并把人导向已有的练习记录 / 错题本。
 */
export function PracticeRunner({
  setId,
  sessionId,
  questions,
  onExit,
}: PracticeRunnerProps) {
  const [queue, setQueue] = useState<AgentSetItem[]>(questions);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<ExamDraft | undefined>(undefined);
  const [judged, setJudged] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);

  // 进入本题的时刻；0 表示还没记（首帧 effect 之前），判分时按 0 处理
  const enteredAtRef = useRef<number>(0);
  const stemRef = useRef<HTMLHeadingElement | null>(null);

  const current = queue[index];
  const total = queue.length;
  const finished = total === 0 || index >= total;
  const percent = progressPercent(Math.min(index, total), total);

  // 每换一道题重新计时；切题时把焦点放到新题干（与练习页一致的屏读行为）
  useEffect(() => {
    enteredAtRef.current = Date.now();
    if (index > 0) stemRef.current?.focus();
  }, [index]);

  const advance = useCallback(() => {
    setDraft(undefined);
    setJudged(null);
    setIndex((value) => value + 1);
  }, []);

  const submit = async (userAnswer: string) => {
    if (!current || submitting || judged !== null) return;
    setSubmitting(true);
    try {
      const result = await submitAgentSetAnswer(sessionId, {
        questionId: current.question.id,
        userAnswer,
        duration: Math.max(
          0,
          Date.now() - (enteredAtRef.current || Date.now()),
        ),
      });
      setJudged(result.isCorrect);
      setAnsweredCount((count) => count + 1);
      if (result.isCorrect) setCorrectCount((count) => count + 1);
    } catch (caught) {
      // 判分失败不能假装"没答过"：留在本题，允许再点一次
      console.error("[agent-sets] 判分失败", {
        sessionId,
        questionId: current.question.id,
        err: caught,
      });
      toast.error(
        caught instanceof Error ? caught.message : "判分失败，请再试一次",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectOption = (letter: string) => {
    if (judged !== null || submitting) return;
    setDraft({ kind: "choice", letters: [letter] });
    void submit(letter);
  };

  const handleToggleOption = (letter: string) => {
    if (judged !== null || submitting) return;
    setDraft((prev) => {
      const letters = prev?.kind === "choice" ? prev.letters : [];
      return {
        kind: "choice",
        letters: letters.includes(letter)
          ? letters.filter((item) => item !== letter)
          : [...letters, letter],
      };
    });
  };

  const handleFillChange = (blanks: string[]) => {
    if (judged !== null || submitting) return;
    setDraft({ kind: "fill", blanks });
  };

  const handleConfirm = () => {
    if (!current) return;
    if (!isDraftAnswered(draft)) {
      toast.warning("先把答案选好，再提交");
      return;
    }
    void submit(draftToUserAnswer(draft, current.question.type));
  };

  const handleFlag = async (reason: string | undefined) => {
    if (!current) return;
    setFlagging(true);
    setFlagError(null);
    const targetId = current.question.id;
    try {
      const result = await flagAgentSetQuestion(setId, targetId, reason);
      const nextQueue = queue.filter((item) => item.question.id !== targetId);
      setQueue(nextQueue);
      // 下一题会滑到当前下标：把判分/草稿清掉，避免显示成"上一题的对错"
      setDraft(undefined);
      setJudged(null);
      setFlagOpen(false);
      const remaining =
        result.remaining ??
        Math.max(0, nextQueue.length - Math.min(index, nextQueue.length));
      toast.success(`已反馈给 Agent，本批剩余 ${remaining} 题`);
    } catch (caught) {
      console.error("[agent-sets] 反馈题目失败", {
        setId,
        targetId,
        err: caught,
      });
      setFlagError(
        caught instanceof Error ? caught.message : "反馈失败，请稍后重试",
      );
    } finally {
      setFlagging(false);
    }
  };

  if (finished) {
    const accuracy =
      answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          本轮结束
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {answeredCount > 0 ? "这一批做完了" : "暂时没有可以做的题"}
        </h2>
        {answeredCount > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            做完 {answeredCount} 题，答对{" "}
            <span className="font-semibold text-foreground">
              {correctCount}
            </span>{" "}
            题，正确率 {accuracy}%。记录已写进练习记录，答错的题在错题本里。
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            这批题都已经做过了，或者你刚刚把它们都反馈了。等 Agent
            推新的一批来吧。
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={onExit} className="gap-2">
            <ArrowRight className="h-4 w-4" aria-hidden />
            回到题集
          </Button>
          <Button variant="outline" asChild>
            <Link href="/history">练习记录</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/wrong-book">错题本</Link>
          </Button>
        </div>
      </div>
    );
  }

  const type = current.question.type ?? "single";
  const needsConfirm = type === "multi" || type === "fill_blank";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            第{" "}
            <span className="font-semibold text-foreground">
              {Math.min(index + 1, total)}
            </span>{" "}
            / {total} 题
          </p>
          <div
            className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-muted sm:w-56"
            role="progressbar"
            aria-label="练习进度"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFlagOpen(true)}
            disabled={submitting}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">这题有问题</span>
            <span className="sr-only sm:hidden">这题有问题</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExitOpen(true)}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            退出
          </Button>
        </div>
      </div>

      <ExamQuestionCard
        key={current.question.id}
        question={current.question}
        position={current.position}
        draft={draft}
        onSelectOption={handleSelectOption}
        onToggleOption={handleToggleOption}
        onFillChange={handleFillChange}
        stemRef={stemRef}
      />

      <div className="flex flex-col gap-2">
        {needsConfirm && judged === null && (
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full"
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {submitting ? "判分中…" : "确认提交"}
          </Button>
        )}

        <div role="status" aria-live="polite">
          {judged !== null && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                judged
                  ? "border-success/40 bg-success-muted"
                  : "border-destructive/30 bg-destructive/10",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {judged ? (
                  <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" aria-hidden />
                )}
                {judged ? "回答正确" : "回答错误"}
              </p>
              <Button size="sm" onClick={advance} className="gap-1.5" autoFocus>
                {index + 1 >= total ? "查看结果" : "下一题"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/80">
          {needsConfirm
            ? "选好后点「确认提交」，当场判分。"
            : "点选项即作答并判分。"}
          答过的题会记进练习记录，答错的进错题本。
        </p>
      </div>

      {flagOpen && (
        <FlagDialog
          position={current.position}
          busy={flagging}
          error={flagError}
          onCancel={() => {
            setFlagOpen(false);
            setFlagError(null);
          }}
          onConfirm={(reason) => void handleFlag(reason)}
        />
      )}

      {exitOpen && (
        <ConfirmDialog
          title="退出这次练习？"
          description="已经答过的题都记进练习记录了，下次练习会从还没做的题继续。"
          confirmLabel="退出练习"
          onConfirm={onExit}
          onCancel={() => setExitOpen(false)}
        />
      )}
    </div>
  );
}
