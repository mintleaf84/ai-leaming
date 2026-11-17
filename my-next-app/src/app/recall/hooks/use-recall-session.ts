"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
} from "../lib/actions";
import {
  buildOverrides,
  presentedIndexes,
  previewVerdicts,
  splitClozeAnswers,
  type RecallPreview,
} from "../lib/preview";
import type { RecallInitialQueue, RecallPhase } from "../types";

/**
 * 「今天」页 + 作答流的状态机（规格 §4.1 / §4.2 / §4.3）。
 *
 * 状态机：`today → question ⇄ judge → (下一张 | done)`。
 * 冷启动**没有**引导页：队列一回来就取第一张卡，`today` 只是取卡这半拍里的骨架态。
 *
 * 这个 hook **不渲染任何 JSX**：屏在 `../components/*`，编排在 `../RecallSession.tsx`。
 * 页面上不出现评分按钮、正确率、徽章、等级（规格 §3）：评分由判分结果推导，
 * 用户只看到「下次 11 月 20 日」或「明天只重测这 3 条」。
 */

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

export function useRecallSession(initialQueue: RecallInitialQueue) {
  const [phase, setPhase] = useState<RecallPhase>("loading");
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
  // 作答轮次令牌：换队列（bootstrap）或换卡（advance）即 +1。
  // 提交/归档在 await 前捕获它，回来先比对——不一致说明结果属于上一轮，
  // 写了就会污染新卡的结论、幂等键与重试引用。
  const roundRef = useRef(0);

  const updatePending = useCallback((ids: RecallCardId[]) => {
    pendingRef.current = ids;
    setPending(ids);
  }, []);

  // 冷启动：队列 → 第一张卡（中间不做任何"开始"确认）
  useEffect(() => {
    let cancelled = false;
    const version = queueVersionRef.current + 1;
    queueVersionRef.current = version;
    roundRef.current += 1;

    async function bootstrap() {
      setPhase("loading");
      setLoadError(null);
      // 换了队列 = 换了一轮作答：上一轮的作答文本、预判、结论与幂等键都必须清掉。
      // 否则新卡首屏会带着旧答案/旧结论，点「看答案」直接显示上一张的结果。
      setTyped("");
      setPreview(null);
      setFinalVerdicts([]);
      setResult(null);
      setLastNote(null);
      setRetryLocked(false);
      // 上一轮提交若还挂着，它的 finally 会因为令牌不符而不再收尾，这里负责把提交态归零
      setSubmitting(false);
      lastSubmitRef.current = null;
      clientKeyRef.current = null;
      try {
        const today = await fetchRecallQueue();
        // 旧快照（上一次拉取 / 跨学习日）回来晚了一步：直接丢弃，
        // 否则它会把刚拿到的新队列覆盖回旧的卡片顺序
        if (cancelled || version !== queueVersionRef.current) return;

        setQueue(today);
        // 最新队列是权威：它明确说「今天 0 张」就是空态，绝不回退到首屏快照，
        // 否则用户会去取已不属于今日队列的卡，或者撞进取卡错误态
        if (today.total === 0) {
          updatePending([]);
          setPhase("empty");
          return;
        }

        // 最新队列仍有卡：action 的 `ids` 是权威顺序；旧服务端只回计数时用服务端渲染的快照兜底
        const serverIds =
          initialQueue.ids.length > 0
            ? initialQueue.ids
            : [...initialQueue.due, ...initialQueue.fresh];
        const ids = today.ids.length > 0 ? today.ids : serverIds;

        if (ids.length === 0) {
          // 有卡却拿不到编号：宁可报错，也不能显示成「今天没有卡」
          throw new Error("今日队列缺少卡片编号，请稍后重试");
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
    // 换卡 = 换轮：上一轮还挂着的提交/归档回来时要能认出自己已经过期
    roundRef.current += 1;
    // 记下版本：等卡期间若 initialQueue 变化并触发了新的 bootstrap，
    // 这张迟到的卡属于旧队列，不能覆盖新队列的首张卡（否则会把它挤掉）
    const version = queueVersionRef.current;
    const remaining = pendingRef.current.slice(1);
    updatePending(remaining);
    setTyped("");
    setPreview(null);
    setFinalVerdicts([]);
    setResult(null);
    // 换卡就是换一次作答：上一个幂等键不能带过来
    clientKeyRef.current = null;
    // 上一轮挂着的提交已经过期（它的 finally 会因为令牌不符而不再收尾），
    // 提交态与重试锁在这里归零，否则新卡会被上一轮的锁/提交态卡住
    setSubmitting(false);
    setRetryLocked(false);
    lastSubmitRef.current = null;

    if (remaining.length === 0) {
      setCard(null);
      setPhase("done");
      return;
    }

    setPhase("today");
    setCard(null);
    try {
      const next = await fetchRecallCard(remaining[0]);
      // 迟到结果：期间队列已被重新拉取，这张卡属于旧队列，直接丢弃
      if (version !== queueVersionRef.current) return;
      setCard(next);
      setPhase("question");
    } catch (error) {
      if (version !== queueVersionRef.current) return;
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

  /**
   * 提交作答（两种方式共用一条路径）。
   *
   * `retryLocked` 期间**只允许重放首次那份载荷**：服务端按 `clientKey` 重放首次结果，
   * 如果重试时换成另一种提交方式（「确认结果」↔「全没想起」），服务端返回的是首次
   * 的结果、界面显示的却是新选择，两边就不一致了。所以「同一 key = 同一载荷」不是
   * 建议，是这条路径的结构保证：载荷在第一次提交时被闭包捕获，重试只是再调一次。
   */
  const lastSubmitRef = useRef<null | (() => Promise<void>)>(null);

  const submitAnswer = async (mode: "verdicts" | "allBlank"): Promise<void> => {
    if (retryLocked && lastSubmitRef.current) {
      // 重试：原样重放，不重新构造载荷
      return lastSubmitRef.current();
    }
    if (!card) return;
    // 取一份局部快照：三元分支里 TS 不会因为上面的 guard 而收窄 preview
    const judgedPreview = preview;
    if (mode === "verdicts" && !judgedPreview) return;
    // 载荷与轮次一起快照：这份结果只对「这一轮」有效
    const round = roundRef.current;

    const isAllBlank = mode === "allBlank";
    let payload;
    if (isAllBlank) {
      payload = {
        cardId: card.cardId,
        typed,
        allBlank: true as const,
        clientKey: clientKeyRef.current ?? undefined,
      };
    } else {
      // 显式分支而不是三元：mode 与 preview 的非空性在这里直接关联，不用靠推断
      if (!judgedPreview) return;
      payload = {
        cardId: card.cardId,
        typed,
        overrides: buildOverrides(
          judgedPreview.presented,
          judgedPreview.verdicts,
          finalVerdicts,
        ),
        clientKey: clientKeyRef.current ?? undefined,
      };
    }

    const run = async (): Promise<void> => {
      setSubmitting(true);
      try {
        const outcome = await submitRecall(payload);
        // 期间换了队列/换了卡：这份结果属于上一轮，整体丢弃
        // （不写 result、不清幂等键/重试引用、不解锁——新轮的东西一概不碰）
        if (round !== roundRef.current) return;
        setResult(outcome);
        setLastNote(outcome.nextReviewText);
        if (isAllBlank) {
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
        }
        // 这次作答已经落库，key 用完即弃（下一张卡会重新生成）
        clientKeyRef.current = null;
        lastSubmitRef.current = null;
        setRetryLocked(false);
      } catch (error) {
        // 写操作失败：不推进状态，人还停在这一屏，再按一次就是同一份载荷
        console.error(
          isAllBlank ? "[recall] 全没想起提交失败" : "[recall] 提交作答失败",
          error,
        );
        // 期间换了队列/换了卡：这次失败属于上一轮，不能锁住新轮的判定，
        // 更不能把旧载荷的重试引用留给新卡（新卡重试会发出旧卡的 cardId）
        if (round !== roundRef.current) return;
        toast.error(`这次没有记下来：${actionErrorMessage(error)}`);
        // 结果未知：锁住判定，重试沿用同一 clientKey 与**同一份载荷**
        lastSubmitRef.current = run;
        setRetryLocked(true);
        return;
      } finally {
        // 旧轮次的收尾不能关掉新轮次的提交态
        if (round === roundRef.current) setSubmitting(false);
      }
    };

    return run();
  };

  const commitVerdicts = () => submitAnswer("verdicts");
  const markAllBlank = () => submitAnswer("allBlank");

  const archive = async () => {
    if (!card) return;
    if (!window.confirm("归档后这张卡不再出现在队列里，已复习的记录会保留。")) {
      return;
    }
    // 归档开始时记下轮次：等到返回时若队列/卡已换，advance() 会拿新队列的
    // pending 去推进，等于删掉新队列里还没作答的第一张卡
    const round = roundRef.current;
    setBusy(true);
    try {
      await archiveRecallCard(card.cardId, true);
      toast.success("已归档");
      if (round !== roundRef.current) return;
      await advance();
    } catch (error) {
      console.error("[recall] 归档失败", error);
      toast.error(`归档失败：${actionErrorMessage(error)}`);
      return;
    } finally {
      setBusy(false);
    }
  };

  /** 错误态重试：队列快照来自服务端，页面还要 `router.refresh()`（在编排层调） */
  const reload = () => setReloadKey((key) => key + 1);

  const displayTotal = queue?.total ?? initialQueue.total;
  const displayMinutes =
    queue?.estimatedMinutes ?? initialQueue.estimatedMinutes;
  const doneCount = Math.max(0, displayTotal - pending.length);
  const clozeIndexes = card ? presentedIndexes(card) : [];
  const retestCount =
    card?.mode === "retest" ? (card.pendingItems?.length ?? 0) : 0;
  const segments = card ? splitClozeAnswers(typed, clozeIndexes.length) : [];

  return {
    // 状态
    phase,
    queue,
    card,
    typed,
    setTyped,
    preview,
    finalVerdicts,
    result,
    lastNote,
    loadError,
    busy,
    submitting,
    retryLocked,
    // 转移
    reveal,
    toggleVerdict,
    commitVerdicts,
    markAllBlank,
    archive,
    advance,
    reload,
    // 派生
    resultRef,
    displayTotal,
    displayMinutes,
    doneCount,
    clozeIndexes,
    retestCount,
    segments,
  };
}

export type UseRecallSessionResult = ReturnType<typeof useRecallSession>;
