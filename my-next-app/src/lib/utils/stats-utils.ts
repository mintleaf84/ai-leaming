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
  yesterday: string
): number {
  if (practiceDates.length === 0) return 0;

  // 1. 检查最近一次练习是否是在“今天”或“昨天”
  // 如果最近一次练习比昨天还早，说明连续已经中断
  const latestPractice = practiceDates[0];
  if (latestPractice !== today && latestPractice !== yesterday) {
    return 0;
  }

  let streak = 0;
  // 从最近的有记录的日期开始检查
  // 转换 YYYY-MM-DD 为 Date 对象时，为了避免时区问题，建议补全时间或使用 UTC
  const parseDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  };

  const expectedDate = parseDate(latestPractice);

  for (const dateStr of practiceDates) {
    const currentDate = parseDate(dateStr);
    
    // 计算差距
    const diffMs = expectedDate.getTime() - currentDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // 找到了期望的日期
      streak++;
      // 期望日期推向更早的一天
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (diffDays > 0) {
      // 当前日期比期望日期还早，说明中间断开了
      break;
    }
    // 如果 diffDays < 0 (理论上不应该，因为输入是倒序的) 则继续
  }

  return streak;
}
