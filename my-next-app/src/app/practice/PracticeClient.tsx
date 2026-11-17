"use client";

import React, { Suspense, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AlertTriangle, Loader2 } from "lucide-react";

// Imported Components
import { HeaderProgressBar } from "@/components/practice/HeaderProgressBar";
import { ExitConfirmModal } from "@/components/practice/ExitConfirmModal";
import { FinishedCard } from "@/components/practice/FinishedCard";
import { PracticeCard } from "@/components/practice/PracticeCard";
import { ReviewCard } from "@/components/practice/ReviewCard";

// Controller Hook
import { usePracticeController } from "./hooks/use-practice-controller";

function PracticeContent({
  enableIntelligentReview,
}: {
  enableIntelligentReview: boolean;
}) {
  const {
    state,
    isLoadingAI,
    showExitConfirm,
    selectedOptions,
    timerConfig,
    actions,
  } = usePracticeController(enableIntelligentReview);

  // 切题的"出口"（docs/ux-a11y-audit.md §3.7）：
  // 答题后整屏换成下一题，视觉上够明显，但屏读用户既听不到"题变了"，
  // 也听不到对错（对错只挂在一次性 toast 上）。这里补两件事：
  //   1) 焦点落到新题题干（tabIndex=-1），屏幕阅读器随即读出题干本身；
  //   2) 一条 role="status" 播报整句"回答正确/错误 + 第 N 题，共 M 题"。
  //
  // 播报文本从 state 直接推导（不存 state、只在 effect 里做焦点这个 DOM 动作）：
  // reducer 一推进就重渲染，"第 N 题"随之变化即触发播报；文本没变就不会重复念。
  const questionStemRef = useRef<HTMLHeadingElement>(null);
  const previousQuestionIdRef = useRef<number | undefined>(undefined);

  const currentQuestion = state.sessionQueue[state.currentIndex];
  const previousQuestion =
    state.currentIndex > 0 ? state.sessionQueue[state.currentIndex - 1] : null;
  const previousAnswered = previousQuestion
    ? state.answers[previousQuestion.id]
    : undefined;
  const totalCount = state.sessionQueue.length;

  const announcement =
    state.status === "finished"
      ? "本组练习已结束，可以查看统计或开始新的一组。"
      : state.status === "practicing" && currentQuestion
        ? `${
            previousAnswered
              ? previousAnswered.isCorrect
                ? "回答正确。"
                : "回答错误。"
              : ""
          }第 ${state.currentIndex + 1} 题，共 ${totalCount} 题。`
        : "";

  // 只有"真的换了另一道题"才移焦点：首题加载、复盘结束回到同一题时抢焦点，
  // 会打断用户正在进行的朗读/选择。
  const stemQuestionId = currentQuestion?.id;
  useEffect(() => {
    const previousId = previousQuestionIdRef.current;
    previousQuestionIdRef.current = stemQuestionId;
    if (previousId === undefined || previousId === stemQuestionId) return;
    if (state.status !== "practicing") return;
    questionStemRef.current?.focus();
  }, [stemQuestionId, state.status]);

  if (state.status === "loading")
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
        正在初始化练习会话...
      </div>
    );

  return (
    <ErrorBoundary>
      <div className="min-h-[calc(100vh-64px)] bg-background pb-20">
        <HeaderProgressBar
          status={state.status}
          currentIndex={state.currentIndex}
          totalCount={state.sessionQueue.length}
          onExit={actions.handleExit}
          timerEnabled={timerConfig.enabled}
          timerMode={timerConfig.mode}
          timerSeconds={timerConfig.secondsPerQuestion}
          currentQuestionId={state.sessionQueue[state.currentIndex]?.id}
          accumulatedTime={state.accumulatedTime}
        />

        <div className="p-4 md:p-8 max-w-2xl mx-auto">
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {enableIntelligentReview &&
            state.reviewQueue.length > 0 &&
            state.status === "practicing" && (
              <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  您有 {state.reviewQueue.length} 个知识点待复盘，将在第{" "}
                  {state.reviewTriggeredAt} 题或结束时自动触发。
                </span>
              </div>
            )}

          <AnimatePresence mode="wait">
            {state.status === "practicing" && currentQuestion && (
              <PracticeCard
                question={currentQuestion}
                stemRef={questionStemRef}
                isMulti={currentQuestion.type === "multi"}
                selectedOptions={selectedOptions}
                onOptionClick={actions.handleOptionClick}
                onSubmitMulti={actions.submitMultiChoice}
                isFillBlank={currentQuestion.type === "fill_blank"}
                onFillBlankSubmit={actions.submitAnswer}
              />
            )}

            {enableIntelligentReview && state.status === "reviewing" && (
              <ReviewCard
                currentItem={state.reviewQueue[state.currentReviewIndex]}
                sessionQueue={state.sessionQueue}
                isLoadingAI={isLoadingAI}
                onReviewStep={actions.handleReviewStep}
              />
            )}

            {state.status === "finished" && (
              <FinishedCard
                sessionId={state.sessionId}
                onDashboardClick={() => (window.location.href = "/")}
              />
            )}
          </AnimatePresence>
        </div>

        <ExitConfirmModal
          isOpen={showExitConfirm}
          onCancel={actions.cancelExit}
          onConfirm={actions.confirmExit}
        />
      </div>
    </ErrorBoundary>
  );
}

export default function PracticeClient({
  initialEnableIntelligentReview,
}: {
  initialEnableIntelligentReview: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
          正在加载练习环境...
        </div>
      }
    >
      <PracticeContent
        enableIntelligentReview={initialEnableIntelligentReview}
      />
    </Suspense>
  );
}
