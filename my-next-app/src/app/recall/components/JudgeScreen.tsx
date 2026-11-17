import type { RefObject } from "react";
import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  RecallCardView,
  RecallSubmitView,
  RecallVerdict,
} from "../lib/actions";
import type { RecallPreview } from "../lib/preview";
import { ClozePrompt } from "./ClozePrompt";

/**
 * 判分屏：逐条/逐空的绿黄结果 + 改判 + 提交后的结论块。
 *
 * 这里只做展示与回调：判分预判（`preview`）、用户改判后的最终判定
 * （`finalVerdicts`）都由状态机持有，本组件不推导任何 verdict。
 *
 * 两处刻意的细节：
 * - 改判标记挂在**被点的那一条**上（不是整屏），所以从条目按钮里找；
 * - 提交中/已提交/重试锁定三种情形都要禁掉条目按钮：按钮点下去会改
 *   `finalVerdicts`，而请求里带的是点击那一刻的判定。
 */
export function JudgeScreen({
  card,
  preview,
  finalVerdicts,
  segments,
  retestCount,
  result,
  submitting,
  retryLocked,
  resultRef,
  onToggleVerdict,
}: {
  card: RecallCardView;
  preview: RecallPreview;
  /** 用户改判后的最终判定（与 `preview.presented` 同序） */
  finalVerdicts: RecallVerdict[];
  /** 填空卡：作答按空切开后的文本（与 `preview.presented` 同序） */
  segments: string[];
  /** 重测模式下本次要重测的条目数；首答为 0（不显示提示行） */
  retestCount: number;
  result: RecallSubmitView | null;
  submitting: boolean;
  /** 提交结果未知：锁住判定，重试沿用同一份载荷 */
  retryLocked: boolean;
  /** 结论块：可能比一屏高，状态机在它落地后负责滚到可见处 */
  resultRef: RefObject<HTMLDivElement | null>;
  /** 参数是**卡内下标**位置（`position`），改判经 `buildOverrides` 换算后才上送 */
  onToggleVerdict: (position: number) => void;
}) {
  return (
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
                    onClick={() => onToggleVerdict(position)}
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
                    onClick={() => onToggleVerdict(position)}
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
                          verdict === "ok" ? "text-success" : "text-warning",
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
                        <span className="text-muted-foreground">（空着）</span>
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
  );
}
