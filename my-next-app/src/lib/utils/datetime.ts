/**
 * 时间工具函数
 * 使用 dayjs 统一处理北京时间 (Asia/Shanghai, UTC+8)
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 初始化 dayjs 插件
dayjs.extend(utc);
dayjs.extend(timezone);

const BEIJING_TIMEZONE = 'Asia/Shanghai';

/**
 * 获取当前北京时间的 Date 对象
 * 注意：返回的 Date 对象内部仍是 UTC，但其值已调整为北京时间
 * 保持原有“偏移”逻辑以兼容旧代码，但使用 dayjs 实现更可靠
 */
export function getBeijingNow(): Date {
    const now = dayjs();
    const beijing = now.tz(BEIJING_TIMEZONE);
    // 原始逻辑：Date.now() + 8h - systemOffset
    // beijing.valueOf() 是原始 UTC 时间戳
    // beijing.utcOffset() 是北京偏移量 (480)
    // dayjs().utcOffset() 是当前系统偏移量
    const offsetMs = (beijing.utcOffset() - dayjs().utcOffset()) * 60 * 1000;
    return new Date(beijing.valueOf() + offsetMs);
}

/**
 * 获取北京时间的日期字符串 (YYYY-MM-DD)
 * 这是最常用的函数，用于日期比较和数据库查询
 */
export function getBeijingDateString(date?: Date): string {
    return dayjs(date).tz(BEIJING_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * 获取北京时间的完整时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function getBeijingDateTimeString(date?: Date): string {
    return dayjs(date).tz(BEIJING_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 获取北京时间的 ISO 格式字符串
 * 用于需要存储完整时间戳的场景
 */
export function getBeijingISOString(date?: Date): string {
    return dayjs(date).tz(BEIJING_TIMEZONE).format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取北京时间当前小时 (0-23)
 */
export function getBeijingHour(date?: Date): number {
    return dayjs(date).tz(BEIJING_TIMEZONE).hour();
}

/**
 * 获取北京时间的昨天日期字符串 (YYYY-MM-DD)
 */
export function getBeijingYesterdayString(): string {
    return dayjs().tz(BEIJING_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
}

/**
 * 获取北京时间的 N 天前日期字符串 (YYYY-MM-DD)
 */
export function getBeijingDaysAgoString(days: number): string {
    return dayjs().tz(BEIJING_TIMEZONE).subtract(days, 'day').format('YYYY-MM-DD');
}

/**
 * 格式化日期为显示用格式 (MM/DD)
 */
export function formatBeijingDisplayDate(date: Date): string {
    const d = dayjs(date).tz(BEIJING_TIMEZONE);
    return `${d.month() + 1}/${d.date()}`;
}

/**
 * 获取用于显示的本地化时间字符串 (中文格式)
 */
export function getBeijingLocaleString(date?: Date): string {
    // 匹配 zh-CN 的默认 LocaleString 行为，例如 "2024/6/15 08:00:00"
    return dayjs(date).tz(BEIJING_TIMEZONE).format('YYYY/M/D HH:mm:ss');
}
