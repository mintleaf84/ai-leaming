import { drizzleDb } from "@/lib/db";
import { eq, and, desc, sql, count, avg } from "drizzle-orm";
import {
  practice_logs,
  user_mastery,
  practice_sessions,
  observation_zone,
} from "@/lib/db/drizzle-schema";
import {
  getBeijingDateString,
  getBeijingYesterdayString,
  getBeijingNow,
} from "@/lib/utils/datetime";
import { calculateStreakFromDates } from "@/lib/utils/stats-utils";

export interface UserStats {
  totalPracticed: number;
  totalCorrect: number; // 总答对数
  totalSessions: number; // 总会话数
  averageMastery: number;
  weakPoints: { tag: string; score: number }[];
  todayPracticed: number;
  todayCorrect: number; // 今日答对数
  lastSessionId?: string;
  pendingReviewCount: number; // 待复习错题数
  observationZoneCount: number; // 观察区知识点数
  streakDays: number; // 连续学习天数
  dailyGoal: number; // 每日目标
  dailyProgress: number; // 今日进度百分比
}

export interface TrendDataItem {
  date: string; // YYYY-MM-DD
  displayDate: string; // MM/DD 用于显示
  practiced: number; // 练习题数
  correct: number; // 正确题数
  accuracy: number; // 正确率
}

/**
 * 统计服务 - 核心仪表盘数据计算
 */
export const statsService = {
  /**
   * 获取用户核心统计数据
   */
  async getUserStats(userId: number): Promise<UserStats> {
    const today = getBeijingDateString();

    // 1. 并发查询各项基础指标
    const [
      totalRes,
      masteryRes,
      todayRes,
      lastSession,
      pendingReviewRes,
      observationRes,
      weakPoints,
      sessionCountRes,
    ] = await Promise.all([
      // 总练习数 & 总正确数
      drizzleDb
        .select({
          count: count(),
          correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(practice_logs)
        .where(eq(practice_logs.user_id, userId))
        .get(),
      // 平均掌握度
      drizzleDb
        .select({ value: avg(user_mastery.score) })
        .from(user_mastery)
        .where(eq(user_mastery.user_id, userId))
        .get(),
      // 今日练习数 & 今日正确数
      drizzleDb
        .select({
          count: count(),
          correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(practice_logs)
        .where(
          and(
            eq(practice_logs.user_id, userId),
            sql`date(${practice_logs.timestamp}) = date(${today})`,
          ),
        )
        .get(),
      // 最近一次会话
      drizzleDb
        .select({ id: practice_sessions.id })
        .from(practice_sessions)
        .where(eq(practice_sessions.user_id, userId))
        .orderBy(desc(practice_sessions.created_at))
        .limit(1)
        .get(),
      // 待复习错题 (最近 7 天)
      drizzleDb
        .select({ value: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
        .from(practice_logs)
        .where(
          and(
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false),
            sql`${practice_logs.timestamp} > datetime('now', '-7 days')`,
          ),
        )
        .get() as Promise<{ value: number }>,
      // 观察区数量
      drizzleDb
        .select({ value: count() })
        .from(observation_zone)
        .where(
          and(
            eq(observation_zone.user_id, userId),
            eq(observation_zone.status, "active"),
          ),
        )
        .get(),
      // 薄弱点 (Top 3)
      drizzleDb
        .select({ tag: user_mastery.tag_name, score: user_mastery.score })
        .from(user_mastery)
        .where(
          and(
            eq(user_mastery.user_id, userId),
            sql`${user_mastery.score} < 60`,
          ),
        )
        .orderBy(user_mastery.score)
        .limit(3)
        .all(),
      // 总会话数
      drizzleDb
        .select({ value: count() })
        .from(practice_sessions)
        .where(eq(practice_sessions.user_id, userId))
        .get(),
    ]);

    // 2. 计算连续学习天数
    const streakDays = await this.getStreakDays(userId);

    const dailyGoal = 25;
    const todayCount = todayRes?.count || 0;

    return {
      totalPracticed: totalRes?.count || 0,
      totalCorrect: totalRes?.correct || 0,
      totalSessions: sessionCountRes?.value || 0,
      averageMastery: Math.round(Number(masteryRes?.value) || 0),
      weakPoints: weakPoints.map((wp) => ({
        tag: wp.tag,
        score: wp.score || 0,
      })),
      todayPracticed: todayCount,
      todayCorrect: todayRes?.correct || 0,
      lastSessionId: lastSession?.id,
      pendingReviewCount: pendingReviewRes?.value || 0,
      observationZoneCount: observationRes?.value || 0,
      streakDays,
      dailyGoal,
      dailyProgress: Math.min(100, Math.round((todayCount / dailyGoal) * 100)),
    };
  },

  /**
   * 获取练习趋势图数据
   */
  async getPracticeTrend(
    userId: number,
    days: number = 14,
  ): Promise<TrendDataItem[]> {
    // 获取最近 N 天有练习的原始数据
    const rows = await drizzleDb
      .select({
        date: sql<string>`date(${practice_logs.timestamp})`,
        practiced: count(),
        correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          sql`${practice_logs.timestamp} > datetime('now', '-' || ${days} || ' days')`,
        ),
      )
      .groupBy(sql`date(${practice_logs.timestamp})`)
      .orderBy(sql`date(${practice_logs.timestamp})`)
      .all();

    // 填充完整日期序列 (使用北京时间)
    const result: TrendDataItem[] = [];
    const now = getBeijingNow();

    for (let i = days - 1; i >= 0; i--) {
      const d = now.subtract(i, "day");
      const dateStr = d.format("YYYY-MM-DD");
      const displayDate = d.format("M/D");

      const row = rows.find((r) => r.date === dateStr);
      result.push({
        date: dateStr,
        displayDate,
        practiced: row?.practiced || 0,
        correct: row?.correct || 0,
        accuracy: row?.practiced
          ? Math.round((row.correct / row.practiced) * 100)
          : 0,
      });
    }

    return result;
  },

  /**
   * 计算连续学习天数
   */
  async getStreakDays(userId: number): Promise<number> {
    const today = getBeijingDateString();
    const yesterday = getBeijingYesterdayString();

    // 获取最近 30 天内有练习记录的日期 (倒序)
    const rows = await drizzleDb
      .selectDistinct({
        date: sql<string>`date(${practice_logs.timestamp})`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          sql`${practice_logs.timestamp} > datetime('now', '-30 days')`,
        ),
      )
      .orderBy(desc(sql`date(${practice_logs.timestamp})`))
      .all();

    const dates = rows.map((r) => r.date);
    return calculateStreakFromDates(dates, today, yesterday);
  },
};
