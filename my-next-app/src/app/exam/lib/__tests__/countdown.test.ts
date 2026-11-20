import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_WARNING_MS,
  countdownAnnouncement,
  formatRemaining,
  isExpired,
  isWarning,
  overtimeMs,
  parseDeadline,
  remainingMs,
} from "../countdown";

describe("parseDeadline", () => {
  it("把 ISO 串转成时间戳", () => {
    expect(parseDeadline("2026-11-20T10:00:00.000Z")).toBe(
      Date.parse("2026-11-20T10:00:00.000Z"),
    );
  });

  it("空值/非法值当作不限时（null）", () => {
    expect(parseDeadline(null)).toBeNull();
    expect(parseDeadline(undefined)).toBeNull();
    expect(parseDeadline("")).toBeNull();
    expect(parseDeadline("not-a-date")).toBeNull();
  });
});

describe("remainingMs / overtimeMs", () => {
  const deadline = 1_000_000;

  it("按 now 与 deadline 的差算剩余，且不会为负", () => {
    expect(remainingMs(deadline, 400_000)).toBe(600_000);
    expect(remainingMs(deadline, 1_200_000)).toBe(0);
  });

  it("不限时返回 null，超时毫秒数为 0", () => {
    expect(remainingMs(null, 1_200_000)).toBeNull();
    expect(overtimeMs(null, 1_200_000)).toBe(0);
  });

  it("超时后给出超出的毫秒数", () => {
    expect(overtimeMs(deadline, 1_000_500)).toBe(500);
    expect(overtimeMs(deadline, 900_000)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("不到一小时用 mm:ss，秒数向上取整", () => {
    expect(formatRemaining(65_000)).toBe("01:05");
    // 剩 0.4 秒时不能提前显示 00:00
    expect(formatRemaining(400)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
  });

  it("超过一小时用 h:mm:ss", () => {
    expect(formatRemaining(3_600_000)).toBe("1:00:00");
    expect(formatRemaining(3_930_000)).toBe("1:05:30");
  });

  it("不限时给占位符", () => {
    expect(formatRemaining(null)).toBe("--:--");
  });

  it("负数按 0 处理", () => {
    expect(formatRemaining(-5_000)).toBe("00:00");
  });
});

describe("isExpired / isWarning", () => {
  it("到点才算超时，不限时永远不算", () => {
    expect(isExpired(0)).toBe(true);
    expect(isExpired(1)).toBe(false);
    expect(isExpired(null)).toBe(false);
  });

  it("最后 60 秒进入警示态", () => {
    expect(isWarning(COUNTDOWN_WARNING_MS)).toBe(true);
    expect(isWarning(COUNTDOWN_WARNING_MS - 1)).toBe(true);
    expect(isWarning(COUNTDOWN_WARNING_MS + 1)).toBe(false);
    expect(isWarning(0)).toBe(false);
    expect(isWarning(null)).toBe(false);
  });
});

describe("countdownAnnouncement", () => {
  it("跨过阈值后给出稳定的播报文案", () => {
    expect(countdownAnnouncement(11 * 60_000)).toBe("");
    expect(countdownAnnouncement(10 * 60_000)).toBe("还剩 10 分钟。");
    expect(countdownAnnouncement(9 * 60_000)).toBe("还剩 10 分钟。");
    expect(countdownAnnouncement(5 * 60_000)).toBe("还剩 5 分钟。");
    expect(countdownAnnouncement(60_000)).toBe("还剩 1 分钟。");
    expect(countdownAnnouncement(0)).toBe("时间到，正在交卷。");
  });

  it("不限时与其它文案区分", () => {
    expect(countdownAnnouncement(null)).toBe("本次作答不限时。");
  });

  it("同一阈值内文案不变（避免 aria-live 重复念）", () => {
    expect(countdownAnnouncement(5 * 60_000)).toBe(
      countdownAnnouncement(4 * 60_000 + 59_000),
    );
    // 跨过阈值那一刻才换文案
    expect(countdownAnnouncement(5 * 60_000 + 1_000)).toBe("还剩 10 分钟。");
  });
});
