/**
 * 学习日（study day）边界。
 *
 * 规格 §3 的队列是「每日」粒度：`due` 到期的卡 + 每日新卡投放。如果直接用
 * UTC 日期或自然日 00:00 切分，晚上 23:30 打开应用的用户会在几分钟后就被算作
 * 「新的一天」，当天的补做上限与「今日已学 N 张」都会瞬间重置。
 *
 * 因此统一切到 **Asia/Shanghai 04:00**：04:00 之前的一切操作都归属前一天。
 * 中国自 1991 年起不再实行夏令时，UTC+8 是固定偏移，不需要 tz 数据库
 * （Node 侧的完整时区支持在部分部署环境/镜像里不可靠，这里用纯算术）。
 */

/** 学习日时区（固定 UTC+8） */
export const STUDY_DAY_TIMEZONE = "Asia/Shanghai";
/** 学习日切换时刻：当地时间 04:00 */
export const STUDY_DAY_BOUNDARY_HOUR = 4;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const BOUNDARY_OFFSET_MS = STUDY_DAY_BOUNDARY_HOUR * 60 * 60 * 1000;

/**
 * 返回 `now` 所属学习日的日期串（`YYYY-MM-DD`）。
 *
 * 实现：先把时间平移到「上海本地时间」，再减去 4 小时，取平移后时刻的 UTC 日期。
 * 例（均为 UTC）：19:59 → 北京 03:59 → 归前一天；20:00 → 北京 04:00 → 归当天。
 */
export function getStudyDay(now: Date = new Date()): string {
  const shifted = now.getTime() + SHANGHAI_OFFSET_MS - BOUNDARY_OFFSET_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * 返回某个学习日的起始时刻（该日 04:00 Asia/Shanghai，以 UTC 瞬时表示）。
 *
 * 队列只需要比较 `due <= now`，但「今日新卡已投放多少」要按学习日窗口统计，
 * 这条工具把窗口左边界固定下来，避免每个调用点各写一遍时区算术。
 */
export function getStudyDayStart(studyDay: string): Date {
  // 校验入参形状，避免 "2026-13-45" 之类被 Date.UTC 静默归一化
  if (!/^\d{4}-\d{2}-\d{2}$/.test(studyDay)) {
    throw new Error(`非法学习日：${studyDay}（期望 YYYY-MM-DD）`);
  }
  const [year, month, day] = studyDay.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const shifted = new Date(utcMidnight);
  if (shifted.toISOString().slice(0, 10) !== studyDay) {
    throw new Error(`非法学习日：${studyDay}（不是有效日期）`);
  }
  return new Date(utcMidnight - SHANGHAI_OFFSET_MS + BOUNDARY_OFFSET_MS);
}
