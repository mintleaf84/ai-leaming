import dayjs from "dayjs";

/**
 * 统计相关的辅助函数 (纯函数)
 */

/**
 * 根据练习日期列表计算连续学习天数
 * @param practiceDates 练习日期列表 (已去重且按日期倒序排列，格式 YYYY-MM-DD)
 * @param today 今天日期 (YYYY-MM-DD)
 * @param yesterday 昨天日期 (YYYY-MM-DD)
 * @returns 连续天数
 */
export function calculateStreakFromDates(
  practiceDates: string[],
  today: string,
  yesterday: string,
): number {
  if (practiceDates.length === 0) return 0;

  // 1. 检查最近一次练习是否是在“今天”或“昨天”
  // 如果最近一次练习比昨天还早，说明连续已经中断
  const latestPractice = practiceDates[0];
  if (latestPractice !== today && latestPractice !== yesterday) {
    return 0;
  }

  let streak = 0;
  // 使用 dayjs 处理日期以确保一致性
  let expectedDate = dayjs(latestPractice);

  for (const dateStr of practiceDates) {
    const currentDate = dayjs(dateStr);

    // 计算天数差
    const diffDays = expectedDate.diff(currentDate, "day");

    if (diffDays === 0) {
      // 找到了期望的日期
      streak++;
      // 期望日期推向更早的一天
      expectedDate = expectedDate.subtract(1, "day");
    } else if (diffDays > 0) {
      // 当前日期比期望日期还早，说明中间断开了
      break;
    }
  }

  return streak;
}
