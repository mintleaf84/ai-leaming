"use client";

import { useEffect, useRef, useState } from "react";
import {
  countdownAnnouncement,
  formatRemaining,
  isExpired,
  isWarning,
  parseDeadline,
  remainingMs,
} from "../lib/countdown";

interface CountdownOptions {
  /** 当前时间来源（测试注入假时钟；默认 `Date.now`） */
  now?: () => number;
  /** 刷新间隔（毫秒） */
  intervalMs?: number;
}

export interface ExamCountdown {
  /** 剩余毫秒；不限时为 null */
  remaining: number | null;
  /** `mm:ss` / `h:mm:ss` / `--:--` */
  formatted: string;
  /** 是否已到 deadline（不限时恒为 false） */
  expired: boolean;
  /** 最后 60 秒 */
  warning: boolean;
  /** 给 `aria-live` 的一句话（跨过阈值才变） */
  announcement: string;
}

/**
 * 试卷倒计时。
 *
 * 唯一的时间依据是服务端 `deadlineAt`：组件只按本地时钟算"离 deadline 还有多久"，
 * 刷新、切后台、系统休眠回来都会自然对上（间隔被浏览器节流也不影响，下一次 tick
 * 直接用新的 `now` 重算，不会像"每秒减一"那样越走越慢）。
 *
 * `onExpire` 只会被调用一次：`expiredRef` 兜住重复触发（React 严格模式、tick 竞争）。
 */
export function useExamCountdown(
  deadlineAt: string | null | undefined,
  onExpire: () => void,
  options: CountdownOptions = {},
): ExamCountdown {
  const intervalMs = options.intervalMs ?? 500;
  const nowRef = useRef(options.now);
  const onExpireRef = useRef(onExpire);
  const expiredRef = useRef(false);
  // 初值取本地时钟：测试用假计时器时 `Date.now` 已被接管，注入的 `now` 只负责后续 tick
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    nowRef.current = options.now;
  }, [options.now]);

  const deadline = parseDeadline(deadlineAt ?? null);

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const current = nowRef.current ? nowRef.current() : Date.now();
      setNowMs(current);
      if (current >= deadline && !expiredRef.current) {
        // 到点只认一次：后续 tick 已经不需要了，`expiredRef` 同时挡住重复交卷
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [deadline, intervalMs]);

  const remaining = remainingMs(deadline, nowMs);

  return {
    remaining,
    formatted: formatRemaining(remaining),
    expired: isExpired(remaining),
    warning: isWarning(remaining),
    announcement: countdownAnnouncement(remaining),
  };
}
