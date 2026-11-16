"use client";

import { useRouter } from "next/navigation";

import { usePageBottomBar } from "@/components/layout/bottom-bar-slot";
import { ErrorState } from "@/components/ui/error-state";

import { ActionBar } from "./components/ActionBar";
import { DoneScreen } from "./components/DoneScreen";
import { EmptyScreen } from "./components/EmptyScreen";
import { JudgeScreen } from "./components/JudgeScreen";
import { QuestionScreen } from "./components/QuestionScreen";
import { RecallHeader } from "./components/RecallHeader";
import { SessionActions } from "./components/SessionActions";
import { TodayScreen } from "./components/TodayScreen";
import { useRecallSession } from "./hooks/use-recall-session";
import type { RecallInitialQueue } from "./types";

export type { RecallInitialQueue } from "./types";

/**
 * 「今天」页 + 作答流（规格 §4.1 / §4.2 / §4.3）。
 *
 * 状态机：`today → question → judge → (下一张 | done)`。
 * 冷启动**没有**引导页：队列一回来就取第一张卡，`today` 只是取卡这半拍里的骨架态。
 *
 * 本文件只做编排：状态机在 `hooks/use-recall-session.ts`，屏在 `components/`。
 * 页面上不出现评分按钮、正确率、徽章、等级（规格 §3）：评分由判分结果推导，
 * 用户只看到「下次 11 月 20 日」或「明天只重测这 3 条」。
 */
export default function RecallSession({
  initialQueue,
}: {
  initialQueue: RecallInitialQueue;
}) {
  const router = useRouter();
  const session = useRecallSession(initialQueue);
  const { phase } = session;

  // 只有作答/判分两屏有主操作：底栏真会渲染才登记，否则移动端会出现两条固定底栏
  const hasActions = phase === "question" || phase === "judge";
  usePageBottomBar(hasActions);

  const actions = hasActions ? (
    <SessionActions
      phase={phase}
      hasResult={Boolean(session.result)}
      submitting={session.submitting}
      retryLocked={session.retryLocked}
      busy={session.busy}
      onReveal={session.reveal}
      onCommit={session.commitVerdicts}
      onMarkAllBlank={session.markAllBlank}
      onAdvance={session.advance}
    />
  ) : null;

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl px-4 pb-28 pt-6 md:px-6 md:pb-8 lg:py-10">
      <h1 className="sr-only">回忆自测</h1>

      <RecallHeader
        queue={session.queue}
        displayTotal={session.displayTotal}
        displayMinutes={session.displayMinutes}
        doneCount={session.doneCount}
        lastNote={session.lastNote}
        showLastNote={phase === "question"}
      />

      {phase === "loading" || phase === "today" ? <TodayScreen /> : null}

      {phase === "empty" && <EmptyScreen />}

      {phase === "done" && <DoneScreen lastNote={session.lastNote} />}

      {phase === "error" && (
        <ErrorState
          title="回忆没有加载出来"
          description={session.loadError ?? undefined}
          onRetry={() => {
            // 队列快照来自服务端：刷新页面数据 + 重新跑一次取卡流程
            session.reload();
            router.refresh();
          }}
        />
      )}

      {phase === "question" && session.card && (
        <QuestionScreen
          card={session.card}
          typed={session.typed}
          onTypedChange={session.setTyped}
          clozeIndexes={session.clozeIndexes}
          retestCount={session.retestCount}
          busy={session.busy}
          onArchive={session.archive}
        />
      )}

      {phase === "judge" && session.card && session.preview && (
        <JudgeScreen
          card={session.card}
          preview={session.preview}
          finalVerdicts={session.finalVerdicts}
          segments={session.segments}
          retestCount={session.retestCount}
          result={session.result}
          submitting={session.submitting}
          retryLocked={session.retryLocked}
          resultRef={session.resultRef}
          onToggleVerdict={session.toggleVerdict}
        />
      )}

      {actions && <ActionBar actions={actions} />}
    </div>
  );
}
