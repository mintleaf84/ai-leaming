"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

import { usePageBottomBar } from "@/components/layout/bottom-bar-slot";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ClozePrompt } from "./components/ClozePrompt";
import {
  actionErrorMessage,
  archiveRecallCard,
  fetchRecallCard,
  fetchRecallQueue,
  submitRecall,
  type RecallCardId,
  type RecallCardView,
  type RecallQueueView,
  type RecallSubmitView,
  type RecallVerdict,
} from "./lib/actions";
import {
  buildOverrides,
  presentedIndexes,
  previewVerdicts,
  splitClozeAnswers,
  type RecallPreview,
} from "./lib/preview";

/**
 * 「今天」页 + 作答流（规格 §4.1 / §4.2 / §4.3）。
 *
 * 状态机：`today → question → judge → (下一张 | done)`。
 * 冷启动**没有**引导页：队列一回来就取第一张卡，`today` 只是取卡这半拍里的骨架态。
 *
 * 页面上不出现评分按钮、正确率、徽章、等级（规格 §3）：评分由判分结果推导，
 * 用户只看到「下次 11 月 20 日」或「明天只重测这 3 条」。
 */

type Phase =
  "loading" | "today" | "question" | "judge" | "done" | "empty" | "error";

/** 服务端快照：队列顺序由 `/recall/page.tsx` 提供（action 也回 `ids`，优先用 action 的） */
export interface RecallInitialQueue {
  /** 服务端渲染时算好的卡片编号（顺序 = 到期优先，再新卡） */
  ids: RecallCardId[];
  due: RecallCardId[];
  fresh: RecallCardId[];
  total: number;
  estimatedMinutes: number;
}

/**
 * 提交幂等键。
 *
 * `crypto.randomUUID()` 只在安全上下文（https / localhost）可用；局域网 IP 直连的
 * 开发/内网部署会拿不到，退化成"时间戳 + 随机数"——这一层只是用来区分客户端提交，
 * 不需要密码学强度，唯一性才是要求。
 */
function newClientKey(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") return uuid.call(globalThis.crypto);
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function RecallSession({
  initialQueue,
}: {
  initialQueue: RecallInitialQueue;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<RecallQueueView | null>(null);
  const [pending, setPending] = useState<RecallCardId[]>([]);
  const pendingRef = useRef<RecallCardId[]>([]);
  const [card, setCard] = useState<RecallCardView | null>(null);
  const [typed, setTyped] = useState("");
  const [preview, setPreview] = useState<RecallPreview | null>(null);
  const [finalVerdicts, setFinalVerdicts] = useState<RecallVerdict[]>([]);
  const [result, setResult] = useState<RecallSubmitView | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 判分屏的提交中状态：与 busy 分开是为了让"提交中"只禁用作答相关的按钮，
  // 不影响归档/取卡这些小动作的语义
  const [submitting, setSubmitting] = useState(false);
  // 提交结果未知（网络中断/超时）时锁住判定：重试必须发同一份载荷 + 同一个 clientKey，
  // 否则服务端按 key 重放首次结果，界面却显示新改的判定，两者会不一致
  const [retryLocked, setRetryLocked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const resultRef = useRef<HTMLDivElement | null>(null);
  // 本次作答的幂等键：进入判分屏时生成，失败重试沿用，提交成功后清空
  const clientKeyRef = useRef<string | null>(null);
  // 队列快照版本：每次重新拉取 +1，旧快照回来时不得覆盖新状态
  const queueVersionRef = useRef(0);

  const updatePending = useCallback((ids: RecallCardId[]) => {
    pendingRef.current = ids;
    setPending(ids);
  }, []);

  // 冷启动：队列 → 第一张卡（中间不做任何"开始"确认）
  useEffect(() => {
    let cancelled = false;
    const version = queueVersionRef.current + 1;
    queueVersionRef.current = version;

    async function bootstrap() {
      setPhase("loading");
      setLoadError(null);
      try {
        const today = await fetchRecallQueue();
        // 旧快照（上一次拉取 / 跨学习日）回来晚了一步：直接丢弃，
        // 否则它会把刚拿到的新队列覆盖回旧的卡片顺序
        if (cancelled || version !== queueVersionRef.current) return;

        setQueue(today);
        // action 的 `ids` 是权威顺序；旧服务端只回计数时用服务端渲染的快照兜底
        const serverIds =
          initialQueue.ids.length > 0
            ? initialQueue.ids
            : [...initialQueue.due, ...initialQueue.fresh];
        const ids = today.ids.length > 0 ? today.ids : serverIds;

        if (ids.length === 0) {
          if (today.total > 0) {
            // 有卡却拿不到编号：宁可报错，也不能显示成「今天没有卡」
            throw new Error("今日队列缺少卡片编号，请稍后重试");
          }
          updatePending([]);
          setPhase("empty");
          return;
        }

        updatePending(ids);
        setPhase("today");
        const first = await fetchRecallCard(ids[0]);
        if (cancelled || version !== queueVersionRef.current) return;
        setCard(first);
        setPhase("question");
      } catch (error) {
        if (cancelled || version !== queueVersionRef.current) return;
        console.error("[recall] 今日队列加载失败", error);
        setLoadError(actionErrorMessage(error));
        setPhase("error");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // initialQueue 的身份在服务端重渲染时才变（router.refresh），此时要按新队列重开
  }, [reloadKey, initialQueue, updatePending]);

  const advance = useCallback(async () => {
    const remaining = pendingRef.current.slice(1);
    updatePending(remaining);
    setTyped("");
    setPreview(null);
    setFinalVerdicts([]);
    setResult(null);
    // 换卡就是换一次作答：上一个幂等键不能带过来
    clientKeyRef.current = null;

    if (remaining.length === 0) {
      setCard(null);
      setPhase("done");
      return;
    }

    setPhase("today");
    setCard(null);
    try {
      const next = await fetchRecallCard(remaining[0]);
      setCard(next);
      setPhase("question");
    } catch (error) {
      console.error("[recall] 取下一张卡失败", error);
      setLoadError(actionErrorMessage(error));
      setPhase("error");
      return;
    }
  }, [updatePending]);

  // 不再自动进下一张：`nextReviewText`（「下次 11 月 20 日」）是规格 §4.3 要求展示的信息，
  // 300ms 就跳走等于没展示。用户点「下一张」继续，全对时也一样。

  // 提交后的结论落在卡片底部：判分屏可能比一屏高，滚一下确保它真的被看到
  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [result]);

  const reveal = () => {
    if (!card) return;
    const judged = previewVerdicts(card, typed);
    setPreview(judged);
    setFinalVerdicts(judged.verdicts);
    setLastNote(null);
    setPhase("judge");
    // 进入判分屏就定下这次提交的幂等键：用户之后无论重试几次，服务端都只认一次
    clientKeyRef.current = newClientKey();
  };

  const toggleVerdict = (position: number) => {
    if (retryLocked) return;
    // 提交已发出（或已完成）时不允许再改：请求里带的是点击那一刻的 finalVerdicts，
    // 再改只会让界面与已经写进库的结论对不上
    if (result || submitting) return;
    setFinalVerdicts((previous) =>
      previous.map((verdict, index) =>
        index === position ? (verdict === "ok" ? "miss" : "ok") : verdict,
      ),
    );
  };

  const commitVerdicts = async () => {
    if (!card || !preview) return;
    setSubmitting(true);
    try {
      const overrides = buildOverrides(
        preview.presented,
        preview.verdicts,
        finalVerdicts,
      );
      const outcome = await submitRecall({
        cardId: card.cardId,
        typed,
        overrides,
        clientKey: clientKeyRef.current ?? undefined,
      });
      setResult(outcome);
      setLastNote(outcome.nextReviewText);
      // 这次作答已经落库，key 用完即弃（下一张卡会重新生成）
      clientKeyRef.current = null;
      setRetryLocked(false);
    } catch (error) {
      // 写操作失败：不推进状态，人还停在这一屏，可以直接再按一次（沿用同一个 key）
      console.error("[recall] 提交作答失败", error);
      toast.error(`这次没有记下来：${actionErrorMessage(error)}`);
      // 结果未知：锁住判定，重试沿用同一 clientKey 与同一份载荷
      setRetryLocked(true);
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const markAllBlank = async () => {
    if (!card) return;
    setSubmitting(true);
    try {
      const outcome = await submitRecall({
        cardId: card.cardId,
        typed,
        allBlank: true,
        clientKey: clientKeyRef.current ?? undefined,
      });
      setResult(outcome);
      setLastNote(outcome.nextReviewText);
      // 服务端按 rating=again 记的是"全部没写"：界面必须跟着变成全黄，
      // 否则提交前看到的绿条与这次落库的结论不一致（用户会以为判错了）
      setFinalVerdicts((previous) => previous.map(() => "miss" as const));
      setPreview((previous) =>
        previous
          ? {
              ...previous,
              verdicts: previous.verdicts.map(() => "miss" as const),
            }
          : previous,
      );
      clientKeyRef.current = null;
      setRetryLocked(false);
    } catch (error) {
      console.error("[recall] 全没想起提交失败", error);
      toast.error(`这次没有记下来：${actionErrorMessage(error)}`);
      setRetryLocked(true);
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!card) return;
    if (!window.confirm("归档后这张卡不再出现在队列里，已复习的记录会保留。")) {
      return;
    }
    setBusy(true);
    try {
      await archiveRecallCard(card.cardId, true);
      toast.success("已归档");
      await advance();
    } catch (error) {
      console.error("[recall] 归档失败", error);
      toast.error(`归档失败：${actionErrorMessage(error)}`);
      return;
    } finally {
      setBusy(false);
    }
  };

  const actions =
    phase === "question" ? (
      <Button size="lg" className="w-full" onClick={reveal} disabled={busy}>
        <Eye className="mr-2 h-4 w-4" aria-hidden />
        看答案
      </Button>
    ) : phase === "judge" && !result ? (
      <div className="flex gap-2">
        <Button
          size="lg"
          className="flex-1"
          onClick={commitVerdicts}
          disabled={submitting}
        >
          {retryLocked ? "重试提交" : "确认结果"}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={markAllBlank}
          disabled={submitting}
        >
          全没想起
        </Button>
      </div>
    ) : phase === "judge" && result ? (
      <Button size="lg" className="w-full" onClick={advance} disabled={busy}>
        下一张
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    ) : null;

  usePageBottomBar(Boolean(actions));

  const displayTotal = queue?.total ?? initialQueue.total;
  const displayMinutes =
    queue?.estimatedMinutes ?? initialQueue.estimatedMinutes;
  const doneCount = Math.max(0, displayTotal - pending.length);
  const clozeIndexes = card ? presentedIndexes(card) : [];
  const retestCount =
    card?.mode === "retest" ? (card.pendingItems?.length ?? 0) : 0;
  const segments = card ? splitClozeAnswers(typed, clozeIndexes.length) : [];

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl px-4 pb-28 pt-6 md:px-6 md:pb-8 lg:py-10">
      <h1 className="sr-only">回忆自测</h1>

      {/* 顶部只有一行合计 + 连续天数（规格 §3：无徽章、无积分、无等级） */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            {queue
              ? `回忆 ${displayTotal} 张 · 约 ${displayMinutes} 分钟`
              : "正在准备今天的回忆…"}
          </p>
          {queue && queue.streakDays > 0 && (
            <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
              连续 {queue.streakDays} 天
            </p>
          )}
        </div>
        {displayTotal > 0 && (
          <div className="mt-3 flex items-center gap-1" aria-hidden>
            {Array.from({ length: displayTotal }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index < doneCount ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        )}
        {phase === "question" && lastNote && (
          <p className="mt-3 text-xs text-muted-foreground">
            上一张：{lastNote}
          </p>
        )}
      </div>

      {phase === "loading" || phase === "today" ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      ) : null}

      {phase === "empty" && (
        <EmptyState
          icon={<Layers className="h-10 w-10" aria-hidden />}
          title="今天没有要回忆的卡"
          description="到期的卡和新卡会在早上重新排一次。"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="outline" size="lg">
                <Link href="/recall/decks#import">导入卡组</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/recall/decks">管理卡片</Link>
              </Button>
            </div>
          }
        />
      )}

      {phase === "done" && (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10" aria-hidden />}
          title="今天的回忆做完了"
          description={lastNote ?? "明天再来，新卡会按节奏出现。"}
          action={
            <Button asChild variant="outline" size="lg">
              <Link href="/recall/decks">管理卡片</Link>
            </Button>
          }
        />
      )}

      {phase === "error" && (
        <ErrorState
          title="回忆没有加载出来"
          description={loadError ?? undefined}
          onRetry={() => {
            // 队列快照来自服务端：刷新页面数据 + 重新跑一次取卡流程
            setReloadKey((key) => key + 1);
            router.refresh();
          }}
        />
      )}

      {phase === "question" && card && (
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {card.deckTitle}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 text-muted-foreground"
              onClick={handleArchive}
              disabled={busy}
              aria-label="归档这张卡"
              title="归档这张卡"
            >
              <Archive className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {retestCount > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">
              只重测上次没想起来的 {retestCount} 条
            </p>
          )}

          {card.kind === "cloze" ? (
            <ClozePrompt prompt={card.prompt} presented={clozeIndexes} />
          ) : (
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-foreground md:text-xl md:leading-relaxed">
              {card.prompt}
            </p>
          )}

          <Textarea
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus={false}
            rows={6}
            placeholder={
              card.kind === "cloze"
                ? clozeIndexes.length > 1
                  ? "按空位序号一行写一个空，只写关键词也可以"
                  : "写你记得的答案，只写关键词也可以"
                : "写下你记得的要点，关键词也可以"
            }
            className="mt-4 min-h-36 resize-y text-base leading-relaxed md:text-base"
          />
        </section>
      )}

      {phase === "judge" && card && preview && (
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <p className="mb-3 truncate text-xs text-muted-foreground">
            {card.deckTitle}
          </p>

          {retestCount > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">
              下面 {retestCount} 条就是上次没想起来的
            </p>
          )}

          {card.kind === "cloze" ? (
            <ClozePrompt prompt={card.prompt} presented={preview.presented} />
          ) : (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {card.prompt}
            </p>
          )}

          <div className="mt-4">
            {card.kind === "list" ? (
              <ul className="space-y-2">
                {preview.presented.map((cardIndex, position) => {
                  const item = card.items?.[cardIndex];
                  if (!item) return null;
                  const verdict = finalVerdicts[position] ?? "miss";
                  const changed = preview.verdicts[position] !== verdict;
                  return (
                    <li key={cardIndex}>
                      <button
                        type="button"
                        onClick={() => toggleVerdict(position)}
                        aria-pressed={verdict === "ok"}
                        disabled={Boolean(result) || submitting || retryLocked}
                        className={cn(
                          "flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          verdict === "ok"
                            ? "border-success/30 bg-success-muted"
                            : "border-warning/30 bg-warning-muted",
                          !result && !submitting && "hover:brightness-95",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0",
                            verdict === "ok" ? "text-success" : "text-warning",
                          )}
                        >
                          {verdict === "ok" ? (
                            <Check className="h-4 w-4" aria-hidden />
                          ) : (
                            <Circle className="h-4 w-4" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">
                          {item.text}
                          <span className="sr-only">
                            {verdict === "ok"
                              ? "（已写）"
                              : "（未写，点一下改成已写）"}
                          </span>
                        </span>
                        {changed && (
                          <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                            已改判
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-2">
                {preview.presented.map((blankIndex, position) => {
                  const verdict = finalVerdicts[position] ?? "miss";
                  const answers = card.blanks?.[blankIndex]?.answers ?? [];
                  const written = segments[position] ?? "";
                  return (
                    <li key={blankIndex}>
                      <button
                        type="button"
                        onClick={() => toggleVerdict(position)}
                        aria-pressed={verdict === "ok"}
                        disabled={Boolean(result) || submitting || retryLocked}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                          verdict === "ok"
                            ? "border-success/30 bg-success-muted"
                            : "border-warning/30 bg-warning-muted",
                          !result && !submitting && "hover:brightness-95",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            第 {position + 1} 空
                          </span>
                          <span
                            className={cn(
                              "flex items-center gap-1 text-xs",
                              verdict === "ok"
                                ? "text-success"
                                : "text-warning",
                            )}
                          >
                            {verdict === "ok" ? (
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Circle className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {verdict === "ok" ? "对" : "没对"}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-sm leading-6 text-foreground">
                          {written || (
                            <span className="text-muted-foreground">
                              （空着）
                            </span>
                          )}
                        </p>
                        {verdict === "miss" && answers.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            参考答案：{answers.join(" / ")}
                          </p>
                        )}
                        {preview.verdicts[position] !== verdict && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            已改判
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!result && card.kind === "list" && (
            <p className="mt-3 text-xs text-muted-foreground">
              黄色是没写到的条目，点一下可以改成「已写」。
            </p>
          )}

          {result && (
            <div
              ref={resultRef}
              role="status"
              className={cn(
                "mt-4 rounded-lg border px-4 py-3",
                result.rating === "good"
                  ? "border-success/30 bg-success-muted"
                  : "border-warning/30 bg-warning-muted",
              )}
            >
              <p className="text-sm font-medium text-foreground">
                {result.nextReviewText}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.rating === "good"
                  ? "这张卡答完了"
                  : "没写到的条目明天会单独重测"}
              </p>
            </div>
          )}
        </section>
      )}

      {/* 桌面端：主按钮跟随内容，不走固定底栏 */}
      {actions && <div className="mt-6 hidden md:block">{actions}</div>}

      {/* 移动端：唯一一条固定底栏，主按钮落在拇指区（规格 §6.3） */}
      {actions && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          <div className="mx-auto w-full max-w-3xl">{actions}</div>
        </div>
      )}
    </div>
  );
}
