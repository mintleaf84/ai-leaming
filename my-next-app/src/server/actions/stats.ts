'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth';

export type UserStats = {
  totalPracticed: number;
  averageMastery: number;
  weakPoints: { tag: string; score: number }[];
  todayPracticed: number;
  lastSessionId?: string;
  // 新增待办数据
  pendingReviewCount: number;    // 待复习错题数
  observationZoneCount: number;  // 观察区知识点数
  streakDays: number;            // 连续学习天数
  dailyGoal: number;             // 每日目标
  dailyProgress: number;         // 今日进度百分比
};

export async function getUserStatsAction(): Promise<UserStats> {
  const user = await requireUser();

  // 1. Total practiced
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM practice_logs WHERE user_id = ?').get(user.id) as { count: number };

  // 2. Average mastery
  const masteryRow = db.prepare('SELECT AVG(score) as avg FROM user_mastery WHERE user_id = ?').get(user.id) as { avg: number | null };

  // 3. Weak points (bottom 3)
  const weakPoints = db.prepare(`
    SELECT tag_name as tag, score as score 
    FROM user_mastery 
    WHERE user_id = ? AND score < 60
    ORDER BY score ASC 
    LIMIT 3
  `).all(user.id) as { tag: string; score: number }[];

  // 4. Today practiced
  const today = new Date().toISOString().split('T')[0];
  const todayRow = db.prepare(`
    SELECT COUNT(*) as count 
    FROM practice_logs 
    WHERE user_id = ? AND date(timestamp) = date(?)
  `).get(user.id, today) as { count: number };

  const lastSessionRow = db.prepare('SELECT id FROM practice_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id) as { id: string } | undefined;

  // 5. 待复习错题数 (最近 7 天内的错题)
  const pendingReviewRow = db.prepare(`
    SELECT COUNT(DISTINCT question_id) as count 
    FROM practice_logs 
    WHERE user_id = ? AND is_correct = 0 
    AND timestamp > datetime('now', '-7 days')
  `).get(user.id) as { count: number };

  // 6. 观察区知识点数
  const observationRow = db.prepare(`
    SELECT COUNT(*) as count 
    FROM observation_zone 
    WHERE user_id = ? AND status = 'active'
  `).get(user.id) as { count: number };

  // 7. 连续学习天数
  const streakDays = calculateStreakDays(user.id);

  // 8. 每日目标 (从设置读取，默认 25)
  const dailyGoal = 25;
  const dailyProgress = Math.min(100, Math.round((todayRow.count / dailyGoal) * 100));

  return {
    totalPracticed: totalRow.count,
    averageMastery: Math.round(masteryRow.avg || 0),
    weakPoints,
    todayPracticed: todayRow.count,
    lastSessionId: lastSessionRow?.id,
    pendingReviewCount: pendingReviewRow.count,
    observationZoneCount: observationRow.count,
    streakDays,
    dailyGoal,
    dailyProgress
  };
}

/**
 * 计算连续学习天数
 */
function calculateStreakDays(userId: number): number {
  // 获取最近 30 天内有练习记录的日期
  const rows = db.prepare(`
    SELECT DISTINCT date(timestamp) as practice_date 
    FROM practice_logs 
    WHERE user_id = ? AND timestamp > datetime('now', '-30 days')
    ORDER BY practice_date DESC
  `).all(userId) as { practice_date: string }[];

  if (rows.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // 检查今天或昨天是否有练习
  const firstDate = rows[0].practice_date;
  if (firstDate !== today && firstDate !== yesterday) {
    return 0; // 连续中断
  }

  let streak = 0;
  let checkDate = new Date(firstDate);

  for (const row of rows) {
    const rowDate = new Date(row.practice_date);
    const diffDays = Math.floor((checkDate.getTime() - rowDate.getTime()) / 86400000);

    if (diffDays === 0) {
      streak++;
      checkDate = new Date(rowDate.getTime() - 86400000);
    } else if (diffDays === 1) {
      streak++;
      checkDate = rowDate;
    } else {
      break; // 连续中断
    }
  }

  return streak;
}

// 趋势数据项类型
export type TrendDataItem = {
  date: string;          // YYYY-MM-DD
  displayDate: string;   // MM/DD 用于显示
  practiced: number;     // 练习题数
  correct: number;       // 正确题数
  accuracy: number;      // 正确率
};

/**
 * 获取练习趋势数据 (近 N 天)
 */
export async function getPracticeTrendAction(days: number = 14): Promise<TrendDataItem[]> {
  try {
    const user = await requireUser();

    // 获取近 N 天的每日统计
    const rows = db.prepare(`
      SELECT 
        date(timestamp) as date,
        COUNT(*) as practiced,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM practice_logs
      WHERE user_id = ? AND timestamp > datetime('now', '-${days} days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all(user.id) as { date: string; practiced: number; correct: number }[];

    // 生成完整的日期序列
    const result: TrendDataItem[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getMonth() + 1}/${d.getDate()}`;

      const row = rows.find(r => r.date === dateStr);
      result.push({
        date: dateStr,
        displayDate,
        practiced: row?.practiced || 0,
        correct: row?.correct || 0,
        accuracy: row ? Math.round((row.correct / row.practiced) * 100) : 0
      });
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch practice trend:", error);
    return [];
  }
}