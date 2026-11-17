import { cn } from "@/lib/utils";

import type { RecallQueueView } from "../lib/actions";

/**
 * 顶部一行合计 + 连续天数 + 进度圆点（规格 §3：无徽章、无积分、无等级）。
 *
 * `queue` 为 null 表示队列还没回来：此时只显示占位文案，也不画进度点
 * （`displayTotal` 可能来自服务端快照，画出来会先闪一排空点）。
 */
export function RecallHeader({
  queue,
  displayTotal,
  displayMinutes,
  doneCount,
  lastNote,
  showLastNote,
}: {
  queue: RecallQueueView | null;
  displayTotal: number;
  displayMinutes: number;
  doneCount: number;
  lastNote: string | null;
  /** 只有作答屏显示「上一张：…」（判分屏的结论块已经说了下次日期） */
  showLastNote: boolean;
}) {
  return (
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
      {showLastNote && lastNote && (
        <p className="mt-3 text-xs text-muted-foreground">上一张：{lastNote}</p>
      )}
    </div>
  );
}
