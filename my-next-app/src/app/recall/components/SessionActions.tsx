import { ArrowRight, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { RecallPhase } from "../types";

/**
 * 主操作按钮（桌面端跟随内容、移动端落在固定底栏里，两处渲染同一个元素）。
 *
 * 三个形态（规格 §3：判分屏不出现评分按钮，评分由判分结果推导）：
 * - 作答屏：「看答案」；
 * - 判分屏未提交：「确认结果」（提交结果未知时变「重试提交」）+「全没想起」；
 * - 判分屏已提交：「下一张」——**不自动跳转**，`nextReviewText` 必须先被看到。
 *
 * 非作答/判分态返回 null：调用方据此决定要不要登记页面级底栏。
 */
export function SessionActions({
  phase,
  hasResult,
  submitting,
  retryLocked,
  busy,
  onReveal,
  onCommit,
  onMarkAllBlank,
  onAdvance,
}: {
  phase: RecallPhase;
  /** 本次提交是否已落地（有结论块） */
  hasResult: boolean;
  submitting: boolean;
  retryLocked: boolean;
  busy: boolean;
  onReveal: () => void;
  onCommit: () => void;
  onMarkAllBlank: () => void;
  onAdvance: () => void;
}) {
  if (phase === "question") {
    return (
      <Button size="lg" className="w-full" onClick={onReveal} disabled={busy}>
        <Eye className="mr-2 h-4 w-4" aria-hidden />
        看答案
      </Button>
    );
  }

  if (phase === "judge" && !hasResult) {
    return (
      <div className="flex gap-2">
        <Button
          size="lg"
          className="flex-1"
          onClick={onCommit}
          disabled={submitting}
        >
          {retryLocked ? "重试提交" : "确认结果"}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={onMarkAllBlank}
          disabled={submitting}
        >
          全没想起
        </Button>
      </div>
    );
  }

  if (phase === "judge" && hasResult) {
    return (
      <Button size="lg" className="w-full" onClick={onAdvance} disabled={busy}>
        下一张
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    );
  }

  return null;
}
