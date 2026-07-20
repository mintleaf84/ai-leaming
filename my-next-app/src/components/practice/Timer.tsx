"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface TimerProps {
  /** 计时模式：正计时或倒计时 */
  mode: "count_up" | "count_down";
  /** 倒计时的初始秒数（仅 count_down 模式有效） */
  initialSeconds?: number;
  /** 倒计时归零时的回调 */
  onTimeUp?: () => void;
  /** 是否暂停 */
  paused?: boolean;
  /** 自定义样式类名 */
  className?: string;
}

/**
 * 计时器组件
 * 支持正计时（从 0 开始累加）和倒计时（从初始值递减到 0）两种模式
 */
export function Timer({
  mode,
  initialSeconds = 60,
  onTimeUp,
  paused = false,
  className = "",
}: TimerProps) {
  // 倒计时模式从 initialSeconds 开始，正计时从 0 开始
  const [seconds, setSeconds] = useState(
    mode === "count_down" ? initialSeconds : 0,
  );
  const [hasTriggeredTimeUp, setHasTriggeredTimeUp] = useState(false);

  // 重置计时器（当 initialSeconds 变化时）
  useEffect(() => {
    if (mode === "count_down") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeconds(initialSeconds);
      setHasTriggeredTimeUp(false);
    }
  }, [initialSeconds, mode]);

  // 计时逻辑
  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (mode === "count_down") {
          if (prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        } else {
          // 正计时模式：累加
          return prev + 1;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [mode, paused]);

  // 倒计时归零回调
  useEffect(() => {
    if (
      mode === "count_down" &&
      seconds === 0 &&
      !hasTriggeredTimeUp &&
      onTimeUp
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasTriggeredTimeUp(true);
      onTimeUp();
    }
  }, [seconds, mode, onTimeUp, hasTriggeredTimeUp]);

  // 格式化显示
  const formatTime = useCallback((totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // 是否处于警告状态（倒计时模式下 <= 30 秒）
  const isWarning = mode === "count_down" && seconds <= 30 && seconds > 0;
  // 是否超时
  const isExpired = mode === "count_down" && seconds === 0;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-mono font-medium
        ${
          isExpired
            ? "bg-red-500/20 text-red-600 dark:text-red-400"
            : isWarning
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse"
              : "bg-muted/50 text-muted-foreground"
        }
        ${className}
      `}
    >
      {isWarning || isExpired ? (
        <AlertTriangle className="w-3.5 h-3.5" />
      ) : (
        <Clock className="w-3.5 h-3.5" />
      )}
      <span>{formatTime(seconds)}</span>
    </div>
  );
}
