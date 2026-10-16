import { drizzleDb } from "@/lib/db";
import { eq, and, desc, sql, count, avg } from "drizzle-orm";
import {
  practice_sessions,
  practice_logs,
  questions,
} from "@/lib/db/drizzle-schema";

export interface SessionReportData {
  totalQuestions: number;
  correctCount: number;
  errorTags: string[];
  avgDuration: number;
  dimensionStats: { axis: string; value: number }[];
  accuracy: number;
}

export interface DeepAnalysisData {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  avgDuration: number;
  tagStats: Array<{
    tag: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;
  repeatedErrors: Array<{
    tag: string;
    errorCount: number;
  }>;
  dimensionStats: {
    knowledge: number;
    understanding: number;
    application: number;
  };
}

/**
 * 报告服务 - 处理练习后的数据分析与统计
 */
export const reportService = {
  /**
   * 获取会话报告基础数据
   */
  async getSessionReportData(
    userId: number,
    sessionId?: string,
  ): Promise<SessionReportData | null> {
    let targetSessionId = sessionId;

    // 如果没有 sessionId，获取最近一次
    if (!targetSessionId) {
      const lastSession = await drizzleDb
        .select({ id: practice_sessions.id })
        .from(practice_sessions)
        .where(eq(practice_sessions.user_id, userId))
        .orderBy(desc(practice_sessions.created_at))
        .limit(1)
        .get();

      if (!lastSession) return null;
      targetSessionId = lastSession.id;
    }

    // 1. 基础统计
    const stats = await drizzleDb
      .select({
        total: count(),
        correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(practice_logs.duration_ms),
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.session_id, targetSessionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .get();

    if (!stats || stats.total === 0) return null;

    // 2. 错题知识点 (使用 json_each)
    const errorTagsRows = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT DISTINCT je.value as tag
            FROM ${practice_logs} pl
            JOIN ${questions} q ON q.id = pl.question_id
            JOIN json_each(q.tags) je
            WHERE pl.session_id = ${targetSessionId} AND pl.user_id = ${userId} AND pl.is_correct = 0
        `);

    // 3. 维度统计
    const dimensionRows = await drizzleDb
      .select({
        dimension: questions.dimension,
        total: count(),
        correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .where(
        and(
          eq(practice_logs.session_id, targetSessionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .groupBy(questions.dimension)
      .all();

    const dimensionMap = new Map(
      dimensionRows.map((d) => [
        d.dimension,
        Math.round((d.correct / d.total) * 100),
      ]),
    );

    return {
      totalQuestions: stats.total,
      correctCount: stats.correct || 0,
      errorTags: errorTagsRows.map((r) => r.tag as string),
      avgDuration: Math.round(Number(stats.avgDuration) || 0),
      dimensionStats: [
        { axis: "识记", value: dimensionMap.get("knowledge") ?? 0 },
        { axis: "理解", value: dimensionMap.get("understanding") ?? 0 },
        { axis: "应用", value: dimensionMap.get("application") ?? 0 },
      ],
      accuracy: Math.round((stats.correct / stats.total) * 100),
    };
  },

  /**
   * 获取深度分析所需的结构化数据
   */
  async getDeepAnalysisData(
    userId: number,
    sessionId: string,
  ): Promise<DeepAnalysisData | null> {
    // 1. 基础数据
    const stats = await drizzleDb
      .select({
        total: count(),
        correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(practice_logs.duration_ms),
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.session_id, sessionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .get();

    if (!stats || stats.total === 0) return null;

    // 2. 知识点统计
    const tagStatsRows = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT 
                je.value as tag,
                COUNT(*) as total,
                SUM(CASE WHEN pl.is_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM ${practice_logs} pl
            JOIN ${questions} q ON q.id = pl.question_id
            JOIN json_each(q.tags) je
            WHERE pl.session_id = ${sessionId} AND pl.user_id = ${userId}
            GROUP BY je.value
            ORDER BY total DESC
        `);

    const tagStats = tagStatsRows.map((t) => ({
      tag: t.tag as string,
      total: t.total as number,
      correct: t.correct as number,
      accuracy: Math.round(((t.correct as number) / (t.total as number)) * 100),
    }));

    // 3. 重复错误模式
    const repeatedErrors = tagStats
      .filter((t) => t.total - t.correct >= 2)
      .map((t) => ({ tag: t.tag, errorCount: t.total - t.correct }))
      .sort((a, b) => b.errorCount - a.errorCount);

    // 4. 维度统计
    const dimensionRows = await drizzleDb
      .select({
        dimension: questions.dimension,
        total: count(),
        correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .where(
        and(
          eq(practice_logs.session_id, sessionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .groupBy(questions.dimension)
      .all();

    const dimensionMap = new Map(
      dimensionRows.map((d) => [
        d.dimension,
        d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
      ]),
    );

    return {
      totalQuestions: stats.total,
      correctCount: stats.correct || 0,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      avgDuration: Math.round(Number(stats.avgDuration) || 0),
      tagStats,
      repeatedErrors,
      dimensionStats: {
        knowledge: dimensionMap.get("knowledge") ?? 0,
        understanding: dimensionMap.get("understanding") ?? 0,
        application: dimensionMap.get("application") ?? 0,
      },
    };
  },

  /**
   * 保存分析报告
   */
  async saveReport(userId: number, sessionId: string, report: string) {
    await drizzleDb
      .update(practice_sessions)
      .set({ analysis_report: report })
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      );
    return true;
  },

  /**
   * 获取已保存的报告
   */
  async getSavedReport(
    userId: number,
    sessionId: string,
  ): Promise<string | null> {
    const res = await drizzleDb
      .select({ report: practice_sessions.analysis_report })
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      )
      .get();
    return res?.report || null;
  },
};
