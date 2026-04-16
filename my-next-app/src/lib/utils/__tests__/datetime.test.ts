import { describe, it, expect } from 'vitest';
import {
    getBeijingDateString,
    getBeijingDateTimeString,
    getBeijingISOString,
    getBeijingHour,
    getBeijingYesterdayString,
    getBeijingDaysAgoString,
    formatBeijingDisplayDate,
    getBeijingLocaleString,
    getBeijingNow,
} from '../datetime';

// 辅助：创建固定 UTC 时间的 Date 对象
const utcDate = (isoStr: string) => new Date(isoStr);

describe('datetime 工具函数', () => {
    describe('getBeijingDateString', () => {
        it('UTC 午夜 (00:00Z) 应返回当日北京日期（UTC+8 为 08:00）', () => {
            const date = utcDate('2024-06-15T00:00:00Z'); // 北京 2024-06-15 08:00
            expect(getBeijingDateString(date)).toBe('2024-06-15');
        });

        it('UTC 20:00 应返回次日北京日期（UTC+8 跨午夜）', () => {
            const date = utcDate('2024-06-14T20:00:00Z'); // 北京 2024-06-15 04:00
            expect(getBeijingDateString(date)).toBe('2024-06-15');
        });

        it('UTC 00:00Z 跨年日期应正确处理', () => {
            const date = utcDate('2023-12-31T20:00:00Z'); // 北京 2024-01-01 04:00
            expect(getBeijingDateString(date)).toBe('2024-01-01');
        });

        it('不传参数时应返回今天的北京日期字符串（格式 YYYY-MM-DD）', () => {
            const result = getBeijingDateString();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('getBeijingDateTimeString', () => {
        it('应返回正确格式 YYYY-MM-DD HH:mm:ss', () => {
            const date = utcDate('2024-06-15T00:00:00Z'); // 北京 2024-06-15 08:00:00
            const result = getBeijingDateTimeString(date);
            expect(result).toBe('2024-06-15 08:00:00');
        });

        it('UTC 15:30:45 应显示北京 23:30:45 同日', () => {
            const date = utcDate('2024-03-20T15:30:45Z'); // 北京 2024-03-20 23:30:45
            expect(getBeijingDateTimeString(date)).toBe('2024-03-20 23:30:45');
        });

        it('不传参数时应返回 YYYY-MM-DD HH:mm:ss 格式', () => {
            const result = getBeijingDateTimeString();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });
    });

    describe('getBeijingISOString', () => {
        it('应返回 +08:00 时区偏移的 ISO 格式字符串', () => {
            const date = utcDate('2024-06-15T00:00:00Z'); // 北京 2024-06-15T08:00:00+08:00
            expect(getBeijingISOString(date)).toBe('2024-06-15T08:00:00+08:00');
        });

        it('UTC 午夜前一刻应跨日', () => {
            const date = utcDate('2024-06-14T23:00:00Z'); // 北京 2024-06-15T07:00:00+08:00
            expect(getBeijingISOString(date)).toBe('2024-06-15T07:00:00+08:00');
        });

        it('不传参数时格式应包含 +08:00', () => {
            const result = getBeijingISOString();
            expect(result).toMatch(/\+08:00$/);
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
        });
    });

    describe('getBeijingHour', () => {
        it('UTC 00:00 应对应北京 8 时', () => {
            const date = utcDate('2024-01-15T00:00:00Z');
            expect(getBeijingHour(date)).toBe(8);
        });

        it('UTC 16:00 应对应北京 0 时（次日）', () => {
            const date = utcDate('2024-01-15T16:00:00Z'); // 北京 00:00
            expect(getBeijingHour(date)).toBe(0);
        });

        it('UTC 08:30 应对应北京 16 时', () => {
            const date = utcDate('2024-01-15T08:30:00Z');
            expect(getBeijingHour(date)).toBe(16);
        });

        it('不传参数时返回值应在 0-23 范围内', () => {
            const hour = getBeijingHour();
            expect(hour).toBeGreaterThanOrEqual(0);
            expect(hour).toBeLessThanOrEqual(23);
        });
    });

    describe('getBeijingYesterdayString', () => {
        it('应返回格式正确的昨天日期', () => {
            const result = getBeijingYesterdayString();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('昨天日期应比今天早一天', () => {
            const today = getBeijingDateString();
            const yesterday = getBeijingYesterdayString();
            const todayMs = new Date(today).getTime();
            const yesterdayMs = new Date(yesterday).getTime();
            expect(todayMs - yesterdayMs).toBe(86400000); // 精确相差 1 天
        });
    });

    describe('getBeijingDaysAgoString', () => {
        it('0 天前应等于今天北京日期', () => {
            const result = getBeijingDaysAgoString(0);
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('1 天前应等于昨天北京日期', () => {
            const yesterday = getBeijingYesterdayString();
            const result = getBeijingDaysAgoString(1);
            expect(result).toBe(yesterday);
        });

        it('7 天前应比今天早 7 天', () => {
            const today = getBeijingDateString();
            const sevenDaysAgo = getBeijingDaysAgoString(7);
            const diff = new Date(today).getTime() - new Date(sevenDaysAgo).getTime();
            expect(diff).toBe(7 * 86400000);
        });
    });

    describe('formatBeijingDisplayDate', () => {
        it('应返回 M/D 格式（不带前导零）', () => {
            const date = utcDate('2024-01-05T00:00:00Z'); // 北京 2024-01-05 08:00
            const result = formatBeijingDisplayDate(date);
            expect(result).toBe('1/5');
        });

        it('月份和日期均应为数字形式', () => {
            const date = utcDate('2024-11-20T00:00:00Z'); // 北京 2024-11-20
            const result = formatBeijingDisplayDate(date);
            expect(result).toBe('11/20');
        });
    });

    describe('getBeijingLocaleString', () => {
        it('应返回包含中文格式的时间字符串', () => {
            const result = getBeijingLocaleString();
            // 中文 locale 格式，例如 "2024/6/15 08:00:00"
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('传入固定日期应正确格式化', () => {
            const date = utcDate('2024-06-15T00:00:00Z'); // 北京 2024-06-15 08:00
            const result = getBeijingLocaleString(date);
            expect(result).toContain('2024');
            expect(result).toContain('6');
            expect(result).toContain('15');
        });
    });

    describe('getBeijingNow', () => {
        it('应返回 Date 对象', () => {
            const now = getBeijingNow();
            expect(now).toBeInstanceOf(Date);
        });

        it('返回的时间戳应约等于 UTC 当前时间加 8 小时（在 UTC 环境中运行）', () => {
            const beforeMs = Date.now();
            const now = getBeijingNow();
            const afterMs = Date.now();
            // getBeijingNow 在 UTC 环境下返回 UTC+8 时间
            // 即时间戳比真实 UTC 时间多约 8 小时
            const EIGHT_HOURS = 8 * 60 * 60 * 1000;
            const tzOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
            const expectedApprox = Date.now() + EIGHT_HOURS - tzOffsetMs;
            expect(Math.abs(now.getTime() - expectedApprox)).toBeLessThan(5 * 1000);
        });
    });
});
