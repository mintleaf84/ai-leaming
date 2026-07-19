// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getBeijingNow,
  getBeijingStartOfDay,
  getBeijingDiffDays,
  formatBeijingDate,
  getBeijingDateString,
  getBeijingDateTimeString,
  getBeijingISOString,
  getBeijingHour,
  getBeijingYesterdayString,
  getBeijingDaysAgoString,
  formatBeijingDisplayDate,
  getBeijingLocaleString,
} from "../datetime";

describe("Datetime Utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T10:30:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getBeijingNow", () => {
    it("应该返回当前的 dayjs 对象", () => {
      const result = getBeijingNow();
      expect(result.format("YYYY-MM-DD")).toBe("2025-06-15");
    });
  });

  describe("getBeijingStartOfDay", () => {
    it("应该返回当天零点", () => {
      const result = getBeijingStartOfDay();
      expect(result.format("HH:mm:ss")).toBe("00:00:00");
    });

    it("应该正确处理指定日期", () => {
      const result = getBeijingStartOfDay("2025-06-20");
      expect(result.format("YYYY-MM-DD")).toBe("2025-06-20");
    });
  });

  describe("getBeijingDiffDays", () => {
    it("应该计算两天之间的差值", () => {
      const result = getBeijingDiffDays("2025-06-20", "2025-06-15");
      expect(result).toBe(5);
    });

    it("应该处理负数差值", () => {
      const result = getBeijingDiffDays("2025-06-10", "2025-06-20");
      expect(result).toBe(-10);
    });

    it("应该返回 0 当日期相同", () => {
      const result = getBeijingDiffDays("2025-06-15", "2025-06-15");
      expect(result).toBe(0);
    });
  });

  describe("formatBeijingDate", () => {
    it("应该格式化日期", () => {
      const result = formatBeijingDate("2025-06-15", "YYYY-MM-DD");
      expect(result).toBe("2025-06-15");
    });

    it("应该处理自定义格式", () => {
      const result = formatBeijingDate("2025-06-15", "MM/DD");
      expect(result).toBe("06/15");
    });
  });

  describe("getBeijingDateString", () => {
    it("应该返回 YYYY-MM-DD 格式", () => {
      const result = getBeijingDateString();
      expect(result).toBe("2025-06-15");
    });

    it("应该处理传入的日期", () => {
      const result = getBeijingDateString(new Date("2025-01-01"));
      expect(result).toBe("2025-01-01");
    });
  });

  describe("getBeijingDateTimeString", () => {
    it("应该返回完整日期时间", () => {
      const result = getBeijingDateTimeString();
      expect(result).toContain("2025-06-15");
      expect(result).toContain(":");
    });
  });

  describe("getBeijingISOString", () => {
    it("应该返回 ISO 格式", () => {
      const result = getBeijingISOString();
      expect(result).toContain("2025-06-15");
      expect(result).toContain("+08:00");
    });
  });

  describe("getBeijingHour", () => {
    it("应该返回当前小时", () => {
      const result = getBeijingHour();
      expect(result).toBe(10);
    });
  });

  describe("getBeijingYesterdayString", () => {
    it("应该返回昨天的日期", () => {
      const result = getBeijingYesterdayString();
      expect(result).toBe("2025-06-14");
    });
  });

  describe("getBeijingDaysAgoString", () => {
    it("应该返回 N 天前的日期", () => {
      const result = getBeijingDaysAgoString(7);
      expect(result).toBe("2025-06-08");
    });

    it("应该处理 0 天", () => {
      const result = getBeijingDaysAgoString(0);
      expect(result).toBe("2025-06-15");
    });
  });

  describe("formatBeijingDisplayDate", () => {
    it("应该返回 M/D 格式", () => {
      const result = formatBeijingDisplayDate(new Date("2025-06-15"));
      expect(result).toBe("6/15");
    });
  });

  describe("getBeijingLocaleString", () => {
    it("应该返回中文格式", () => {
      const result = getBeijingLocaleString();
      expect(result).toContain("2025/");
      expect(result).toContain(":");
    });
  });
});
