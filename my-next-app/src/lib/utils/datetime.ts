/**
 * 时间工具函数
 * 统一使用北京时间 (Asia/Shanghai, UTC+8)
 */

const BEIJING_TIMEZONE = 'Asia/Shanghai';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 的毫秒偏移量

/**
 * 获取当前北京时间的 Date 对象
 * 注意：返回的 Date 对象内部仍是 UTC，但其值已调整为北京时间
 */
export function getBeijingNow(): Date {
    return new Date(Date.now() + BEIJING_OFFSET_MS - new Date().getTimezoneOffset() * 60 * 1000);
}

/**
 * 获取北京时间的日期字符串 (YYYY-MM-DD)
 * 这是最常用的函数，用于日期比较和数据库查询
 */
export function getBeijingDateString(date?: Date): string {
    const targetDate = date ?? new Date();
    return targetDate.toLocaleDateString('sv-SE', { timeZone: BEIJING_TIMEZONE });
}

/**
 * 获取北京时间的完整时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function getBeijingDateTimeString(date?: Date): string {
    const targetDate = date ?? new Date();
    return targetDate.toLocaleString('sv-SE', { timeZone: BEIJING_TIMEZONE }).replace('T', ' ');
}

/**
 * 获取北京时间的 ISO 格式字符串
 * 用于需要存储完整时间戳的场景
 */
export function getBeijingISOString(date?: Date): string {
    const targetDate = date ?? new Date();
    // 使用 sv-SE locale 获取 YYYY-MM-DD 格式
    const dateStr = targetDate.toLocaleDateString('sv-SE', { timeZone: BEIJING_TIMEZONE });
    const timeStr = targetDate.toLocaleTimeString('en-GB', {
        timeZone: BEIJING_TIMEZONE,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    return `${dateStr}T${timeStr}+08:00`;
}

/**
 * 获取北京时间当前小时 (0-23)
 */
export function getBeijingHour(date?: Date): number {
    const targetDate = date ?? new Date();
    return parseInt(targetDate.toLocaleTimeString('en-GB', {
        timeZone: BEIJING_TIMEZONE,
        hour: '2-digit',
        hour12: false
    }), 10);
}

/**
 * 获取北京时间的昨天日期字符串 (YYYY-MM-DD)
 */
export function getBeijingYesterdayString(): string {
    const yesterday = new Date(Date.now() - 86400000);
    return getBeijingDateString(yesterday);
}

/**
 * 获取北京时间的 N 天前日期字符串 (YYYY-MM-DD)
 */
export function getBeijingDaysAgoString(days: number): string {
    const pastDate = new Date(Date.now() - days * 86400000);
    return getBeijingDateString(pastDate);
}

/**
 * 格式化日期为显示用格式 (MM/DD)
 */
export function formatBeijingDisplayDate(date: Date): string {
    const month = parseInt(date.toLocaleDateString('en-GB', {
        timeZone: BEIJING_TIMEZONE,
        month: '2-digit'
    }), 10);
    const day = parseInt(date.toLocaleDateString('en-GB', {
        timeZone: BEIJING_TIMEZONE,
        day: '2-digit'
    }), 10);
    return `${month}/${day}`;
}

/**
 * 获取用于显示的本地化时间字符串 (中文格式)
 */
export function getBeijingLocaleString(date?: Date): string {
    const targetDate = date ?? new Date();
    return targetDate.toLocaleString('zh-CN', { timeZone: BEIJING_TIMEZONE });
}
