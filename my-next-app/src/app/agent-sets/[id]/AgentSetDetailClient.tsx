"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCheck,
  FileCheck2,
  Loader2,
  Play,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAgentSetDetail,
  flagAgentSetQuestion,
  promoteAgentSet,
  startAgentSetAttempt,
} from "../lib/api";
import { formatSetDate, formatSetSource, splitTags } from "../lib/display";
import { applyFlag, selectPendingItems } from "../lib/stats";
import type { AgentSetItem, AgentSetSummary } from "../lib/types";
import { AgentSetQuestionRow } from "../components/AgentSetQuestionRow";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FlagDialog } from "../components/FlagDialog";
import { MakePaperDialog } from "../components/MakePaperDialog";
import { PracticeRunner } from "../components/PracticeRunner";

interface AgentSetDetailClientProps {
  setId: number;
}

interface RunState {
  sessionId: string;
  questions: AgentSetItem[];
}

/**
 * 题集详情 / 练习。
 *
 * 三种状态在同一路由里切换：看题（列表）→ 逐题练（PracticeRunner）→ 返回列表。
 * 不加子路由是有意的：练习会话是"这一批题的一次性运行"，刷新页面即回到列表，
 * 不会出现一个已失效会话的死链接（练习记录在 `/history` 里另有入口）。
 *
 * 报错（这题有问题）只做本地列表更新 + 服务端移除；成卷与转正都走各自接口。
 */
export default function AgentSetDetailClient({
  setId,
}: AgentSetDetailClientProps) {
  const router = useRouter();
  const validId = Number.isFinite(setId) && setId > 0;

  const { data, isLoading, isError, error, retry, refetch } = useAppQuery({
    queryKey: ["agent-set", setId],
    queryFn: () => fetchAgentSetDetail(setId),
    enabled: validId,
  });

  // 本地已反馈的题：服务端保存成功后才加进来，用来立刻从列表消失
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [flagTarget, setFlagTarget] = useState<AgentSetItem | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotedLocally, setPromotedLocally] = useState(false);
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);

  const base = data ? { summary: data.set, items: data.items } : null;

  // 依次应用本地反馈：未做 −1、已反馈 +1，并把题从列表里去掉
  const local = base
    ? removedIds.reduce(
        (acc, questionId) => applyFlag(acc.summary, acc.items, questionId),
        {
          summary: base.summary,
          items: base.items,
          removed: false,
          remaining: 0,
        },
      )
    : null;

  const summary: AgentSetSummary | null = local?.summary ?? null;
  const items: AgentSetItem[] = local?.items ?? [];
  const pending = selectPendingItems(items);
  const promoted = summary?.status === "promoted" || promotedLocally;
  const created = summary ? formatSetDate(summary.createdAt) : null;
  const tags = summary
    ? splitTags(summary.targetTags, 6)
    : { shown: [], rest: 0 };

  const handleStart = async () => {
    if (!summary || starting || pending.length === 0) return;
    setStarting(true);
    try {
      const attempt = await startAgentSetAttempt(summary.id);
      const byId = new Map(pending.map((item) => [item.question.id, item]));
      const fromServer = attempt.questions.filter(
        (question) => question.content.length > 0,
      );
      const queue: AgentSetItem[] =
        fromServer.length > 0
          ? fromServer.map(
              (question, index) =>
                byId.get(question.id) ?? {
                  position: index + 1,
                  question,
                  answered: false,
                },
            )
          : pending;

      if (queue.length === 0) {
        toast.error("这批题暂时没有可以练的题");
        return;
      }
      setRun({ sessionId: attempt.sessionId, questions: queue });
    } catch (caught) {
      // audit-allow: 失败已用 toast/setError 呈现给用户，属可见降级；console.error 仅供排障
      console.error("[agent-sets] 开始练习失败", { setId, err: caught });
      toast.error(
        caught instanceof Error ? caught.message : "开始练习失败，请稍后重试",
      );
    } finally {
      setStarting(false);
    }
  };

  const leavePractice = () => {
    setRun(null);
    // 交还给服务端做权威：已做的题不再出现、已反馈的也已移除
    setRemovedIds([]);
    void refetch();
  };

  const handleFlag = async (reason: string | undefined) => {
    if (!summary || !flagTarget) return;
    setFlagging(true);
    setFlagError(null);
    const questionId = flagTarget.question.id;
    try {
      const result = await flagAgentSetQuestion(summary.id, questionId, reason);
      setRemovedIds((ids) =>
        ids.includes(questionId) ? ids : [...ids, questionId],
      );
      setFlagTarget(null);
      const remaining =
        result.remaining ?? Math.max(0, summary.pendingCount - 1);
      toast.success(`已反馈给 Agent，本批剩余 ${remaining} 题`);
    } catch (caught) {
      // audit-allow: 失败已用 toast/setError 呈现给用户，属可见降级；console.error 仅供排障
      console.error("[agent-sets] 反馈题目失败", {
        setId,
        questionId,
        err: caught,
      });
      setFlagError(
        caught instanceof Error ? caught.message : "反馈失败，请稍后重试",
      );
    } finally {
      setFlagging(false);
    }
  };

  const handlePromote = async () => {
    if (!summary) return;
    setPromoting(true);
    try {
      const { promotedCount } = await promoteAgentSet(summary.id);
      setPromotedLocally(true);
      setPromoteOpen(false);
      toast.success(
        promotedCount && promotedCount > 0
          ? `已转正 ${promotedCount} 题：已进入题库，之后会算进掌握度`
          : "已转正：题目进入题库，之后会算进掌握度",
      );
    } catch (caught) {
      // audit-allow: 失败已用 toast/setError 呈现给用户，属可见降级；console.error 仅供排障
      console.error("[agent-sets] 转正失败", { setId, err: caught });
      toast.error(
        caught instanceof Error ? caught.message : "转正失败，请稍后重试",
      );
    } finally {
      setPromoting(false);
    }
  };

  if (!validId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <ErrorState
          title="题集编号不对"
          description="链接里的编号看起来不完整，回到列表再点一次吧。"
          onRetry={() => router.push("/agent-sets")}
        />
      </div>
    );
  }

  if (run && summary) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={leavePractice}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回题集
          </button>
          <span className="truncate text-xs text-muted-foreground">
            {summary.title}
          </span>
        </div>
        <PracticeRunner
          setId={summary.id}
          sessionId={run.sessionId}
          questions={run.questions}
          onExit={leavePractice}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/agent-sets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        AI 题集
      </Link>

      {isLoading && (
        <div className="mt-4 space-y-3" aria-busy="true">
          <Skeleton className="h-8 w-3/4 rounded-md" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="mt-6">
          <ErrorState
            title="题集没打开"
            description={error?.message}
            onRetry={retry}
          />
        </div>
      )}

      {!isLoading && !isError && summary && (
        <>
          <header className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-snug tracking-tight text-foreground md:text-3xl">
                {summary.title}
              </h1>
              {promoted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                  <CheckCheck className="h-3 w-3" aria-hidden />
                  已转正
                </span>
              )}
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                来自 {formatSetSource(summary.agent, summary.model)}
              </span>
              {created && (
                <span className="text-muted-foreground/60">· {created}</span>
              )}
            </p>

            {summary.note && (
              <blockquote className="mt-4 rounded-r-lg border-l-2 border-primary/40 bg-primary/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
                  Agent 的说明
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {summary.note}
                </p>
              </blockquote>
            )}

            {tags.shown.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground/70">
                  目标考点
                </span>
                {tags.shown.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
                {tags.rest > 0 && (
                  <span className="text-[11px] text-muted-foreground/70">
                    +{tags.rest}
                  </span>
                )}
              </div>
            )}
          </header>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              onClick={() => void handleStart()}
              disabled={starting || pending.length === 0}
              className="gap-2 sm:min-w-40"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {starting
                ? "正在准备…"
                : pending.length === 0
                  ? "没有待做的题"
                  : `开始练习（${pending.length} 题）`}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPaperOpen(true)}
              disabled={pending.length === 0}
              className="gap-2"
            >
              <FileCheck2 className="h-4 w-4" aria-hidden />
              一键成卷
            </Button>
            {!promoted && (
              <Button
                variant="ghost"
                onClick={() => setPromoteOpen(true)}
                className="gap-2 text-muted-foreground"
              >
                <CheckCheck className="h-4 w-4" aria-hidden />
                转正入库
              </Button>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
            {promoted
              ? "这批题已经转正：现在在题库里，作答会计入掌握度统计。"
              : "这批题不进题库，也不影响掌握度统计；做过会记进练习记录与错题本。想让它们变成常驻题库题，用「转正入库」。"}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              { label: "共", value: `${summary.totalQuestions} 题` },
              { label: "已做", value: `${summary.doneCount} 题` },
              { label: "未做", value: `${summary.pendingCount} 题` },
              { label: "已反馈", value: `${summary.flaggedCount} 题` },
            ].map((stat) => (
              <div key={stat.label} className="bg-card px-4 py-3">
                <dt className="text-[11px] text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <section aria-label="待做的题" className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">
                待做的题
              </h2>
              <span className="text-xs text-muted-foreground">
                {pending.length > 0 ? `${pending.length} 题` : "已清空"}
              </span>
            </div>

            {pending.length === 0 ? (
              <EmptyState
                icon={<CheckCheck className="h-10 w-10" aria-hidden />}
                title="这批题都处理完了"
                description="做过的题在练习记录里，反馈过的题已经交给 Agent。等下一批推来就好。"
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/history">练习记录</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href="/agent-sets">回到题集列表</Link>
                    </Button>
                  </div>
                }
                className="mt-3 rounded-xl border border-dashed border-border bg-card/40"
              />
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
                {pending.map((item) => (
                  <AgentSetQuestionRow
                    key={item.question.id}
                    item={item}
                    flagging={flagging}
                    onFlag={(target) => {
                      setFlagError(null);
                      setFlagTarget(target);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {summary.doneCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground/80">
              已经做过的 {summary.doneCount} 题不再列出，可以去{" "}
              <Link href="/history" className="text-primary hover:underline">
                练习记录
              </Link>{" "}
              回看，答错的在{" "}
              <Link href="/wrong-book" className="text-primary hover:underline">
                错题本
              </Link>
              。
            </p>
          )}
        </>
      )}

      {flagTarget && (
        <FlagDialog
          position={flagTarget.position}
          busy={flagging}
          error={flagError}
          onCancel={() => {
            setFlagTarget(null);
            setFlagError(null);
          }}
          onConfirm={(reason) => void handleFlag(reason)}
        />
      )}

      {paperOpen && summary && (
        <MakePaperDialog
          set={summary}
          availableCount={pending.length}
          onClose={() => setPaperOpen(false)}
          onCreated={(paperId) => {
            setPaperOpen(false);
            toast.success("试卷已生成，去作答吧");
            router.push(`/exam/${paperId}`);
          }}
        />
      )}

      {promoteOpen && summary && (
        <ConfirmDialog
          title="把这些题转正入库？"
          description="转正后，这批题会进入题库列表与自动组卷，从现在开始计入掌握度统计。历史作答记录不受影响。"
          confirmLabel="转正入库"
          busyLabel="正在转正…"
          busy={promoting}
          onConfirm={() => void handlePromote()}
          onCancel={() => setPromoteOpen(false)}
        />
      )}
    </div>
  );
}
