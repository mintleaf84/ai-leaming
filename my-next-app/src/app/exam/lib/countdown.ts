/**
 * 倒计时的纯计算与格式化。
 *
 * 时间的唯一来源是服务端的 `deadlineAt`（契约 §5）：客户端只做"现在离 deadline
 * 还有多久"的展示，不在本地累加，也不把刷新/切后台当成暂停。所有函数都显式
 * 接收 `now`，单测因此不需要等真实时间流逝。
 */

/** 进入"紧张"配色的阈值：最后 60 秒 */
export const COUNTDOWN_WARNING_MS = 60_000;

/** 播报阈值（从大到小）：剩余 10 分钟 / 5 分钟 / 1 分钟 */
export const COUNTDOWN_ANNOUNCE_MS = [600_000, 300_000, 60_000] as const;

/** ISO 时间串 → 时间戳；空值或非法值一律 null（= 不限时） */
export function parseDeadline(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

/** 剩余毫秒（不小于 0）；不限时返回 null */
export function remainingMs(
  deadline: number | null,
  now: number,
): number | null {
  if (deadline === null) return null;
  return Math.max(0, deadline - now);
}

/** 已超时的毫秒数（0 = 还没超时） */
export function overtimeMs(deadline: number | null, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, now - deadline);
}

export function isExpired(remaining: number | null): boolean {
  return remaining !== null && remaining <= 0;
}

export function isWarning(remaining: number | null): boolean {
  return (
    remaining !== null &&
    remaining > 0 &&
    remaining <= COUNTDOWN_WARNING_MS
  );
}

/**
 * 倒计时文本：`mm:ss`，超过一小时用 `h:mm:ss`；不限时给 `--:--`。
 * 秒数向上取整 —— 剩 0.4 秒时显示 `00:01` 而不是提前一秒归零。
 */
export function formatRemaining(remaining: number | null): string {
  if (remaining === null) return "--:--";
  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 给读屏播报的一句话：**已经跨过的最紧一个阈值**，而不是"恰好等于阈值"。
 *
 * 为什么不用"等于阈值才播"：倒计时每 500ms 刷新一次，`mm:ss` 文本会跳过某个整秒；
 * 而恰好相等时播一次、下一秒又清空，`aria-live` 会把同一句话念成两遍。返回
 * "跨过的最紧阈值"后，文案在 10 分钟内保持不变，到 5 分钟、1 分钟、归零各变一次。
 */
export function countdownAnnouncement(remaining: number | null): string {
  if (remaining === null) return "本次作答不限时。";
  if (remaining <= 0) return "时间到，正在交卷。";
  // 从最紧的阈值往上找：剩 5 分钟时命中的是 5 分钟，而不是更早的 10 分钟
  for (const threshold of [...COUNTDOWN_ANNOUNCE_MS].reverse()) {
    if (remaining <= threshold) {
      return `还剩 ${threshold / 60_000} 分钟。`;
    }
  }
  return "";
}
