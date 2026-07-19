import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Timer } from "./Timer";

interface HeaderProgressBarProps {
  status:
    "loading" | "practicing" | "reviewing" | "finished" | "error" | "idle";
  currentIndex: number;
  totalCount: number;
  onExit: () => void;
  /** 是否启用计时器 */
  timerEnabled?: boolean;
  /** 计时模式 */
  timerMode?: "count_up" | "count_down";
  /** 每题倒计时秒数（倒计时模式） */
  timerSeconds?: number;
  /** 当前题目 ID（用于重置计时器） */
  currentQuestionId?: number;
  /** 累计答题时间（ms） */
  accumulatedTime?: number;
  /** 倒计时归零回调 */
  onTimerUp?: () => void;
}

export function HeaderProgressBar({
  status,
  currentIndex,
  totalCount,
  onExit,
  timerEnabled = false,
  timerMode = "count_up",
  timerSeconds = 60,
  currentQuestionId,
  accumulatedTime = 0,
  onTimerUp,
}: HeaderProgressBarProps) {
  const progress =
    totalCount > 0
      ? ((currentIndex + (status === "finished" ? 1 : 0)) / totalCount) * 100
      : 0;

  // 只在练习中显示计时器
  const showTimer =
    timerEnabled && (status === "practicing" || status === "reviewing");

  return (
    <div className="sticky top-16 z-40 w-full bg-card border-b border-border shadow-sm">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                status === "practicing"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : status === "reviewing"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : status === "finished"
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {status === "practicing"
                ? "📝 练习中"
                : status === "reviewing"
                  ? "🔍 复盘中"
                  : status === "finished"
                    ? "✅ 已完成"
                    : "⏳ 准备中"}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              题量: {currentIndex + 1} / {totalCount}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 计时器 */}
            {showTimer && (
              <div className="flex flex-col items-end">
                <Timer
                  key={currentQuestionId || "current"}
                  mode={timerMode}
                  initialSeconds={timerSeconds}
                  onTimeUp={onTimerUp}
                  paused={status !== "practicing"}
                />
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  总计: {Math.floor(accumulatedTime / 60000)}分
                  {Math.floor((accumulatedTime % 60000) / 1000)}秒
                </span>
              </div>
            )}

            <button
              onClick={onExit}
              className="p-1 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full transition-all ${status === "reviewing" ? "bg-amber-500" : "bg-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
