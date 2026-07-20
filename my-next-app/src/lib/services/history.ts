import { drizzleDb } from "@/lib/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  practice_sessions,
  practice_logs,
  questions,
  session_reviews,
} from "@/lib/db/drizzle-schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { safeParseJson } from "@/lib/utils/json";

dayjs.extend(utc);

/** 历史记录列表项类型 */
export type SessionHistoryItem = {
  id: string;
  sessionName?: string;
  totalQuestions: number;
  correctCount: number;
  reviewCount: number;
  createdAt: string;
  accuracy: number;
  practiceMode?: string;
};

/** 分页历史记录类型 */
export type PaginatedHistory = {
  items: SessionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** 历史筛选参数 */
export type HistoryFilter = {
  dateFrom?: string;
  dateTo?: string;
  accuracyMin?: number;
  accuracyMax?: number;
  mode?: string;
  page?: number;
  pageSize?: number;
};

/** 会话详情完整类型 */
export type SessionDetail = NonNullable<
  Awaited<ReturnType<typeof historyService.getSessionDetail>>
>;

/**
 * 练习历史服务 - 管理练习会话的查询、统计与维护
 */
export const historyService = {
  /**
   * 获取分页历史记录 (含高级筛选)
   */
  async getHistory(
    userId: number,
    filter: HistoryFilter = {},
  ): Promise<PaginatedHistory> {
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 10;
    const offset = (page - 1) * pageSize;

    // 1. 构建动态条件
    const conditions = [eq(practice_sessions.user_id, userId)];

    // 使用 dayjs 将用户输入的日期转换为 UTC 日期字符串进行对比
    if (filter.dateFrom) {
      const fromDate = dayjs(filter.dateFrom).utc().format("YYYY-MM-DD");
      conditions.push(
        sql`date(${practice_sessions.created_at}) >= date(${fromDate})`,
      );
    }
    if (filter.dateTo) {
      const toDate = dayjs(filter.dateTo).utc().format("YYYY-MM-DD");
      conditions.push(
        sql`date(${practice_sessions.created_at}) <= date(${toDate})`,
      );
    }
    if (filter.mode && filter.mode.trim()) {
      conditions.push(eq(practice_sessions.practice_mode, filter.mode.trim()));
    }

    // 性能优化：将正确率筛选下沉到 SQL 层，使用参数化查询防止注入
    if (
      filter.accuracyMin !== undefined &&
      filter.accuracyMin >= 0 &&
      filter.accuracyMin <= 100
    ) {
      conditions.push(
        sql`(CASE WHEN ${practice_sessions.total_questions} > 0 THEN ROUND((CAST(${practice_sessions.correct_count} AS FLOAT) / ${practice_sessions.total_questions}) * 100) ELSE 0 END) >= ${filter.accuracyMin})`,
      );
    }
    if (
      filter.accuracyMax !== undefined &&
      filter.accuracyMax >= 0 &&
      filter.accuracyMax <= 100
    ) {
      conditions.push(
        sql`(CASE WHEN ${practice_sessions.total_questions} > 0 THEN ROUND((CAST(${practice_sessions.correct_count} AS FLOAT) / ${practice_sessions.total_questions}) * 100) ELSE 0 END) <= ${filter.accuracyMax})`,
      );
    }

    const where = and(...conditions);

    // 2. 并发查询总数和列表数据
    const [totalResult, rows] = await Promise.all([
      drizzleDb
        .select({ value: count() })
        .from(practice_sessions)
        .where(where)
        .get(),
      drizzleDb
        .select({
          id: practice_sessions.id,
          sessionName: practice_sessions.session_name,
          totalQuestions: practice_sessions.total_questions,
          correctCount: practice_sessions.correct_count,
          reviewCount: practice_sessions.review_count,
          createdAt: practice_sessions.created_at,
          practiceMode: practice_sessions.practice_mode,
        })
        .from(practice_sessions)
        .where(where)
        .orderBy(desc(practice_sessions.created_at))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult?.value || 0;

    // 3. 格式化结果
    const items: SessionHistoryItem[] = rows.map((r) => ({
      id: String(r.id),
      sessionName: r.sessionName || undefined,
      totalQuestions: r.totalQuestions || 0,
      correctCount: r.correctCount || 0,
      reviewCount: r.reviewCount || 0,
      createdAt: dayjs.utc(r.createdAt).toISOString(),
      accuracy:
        (r.totalQuestions || 0) > 0
          ? Math.round(((r.correctCount || 0) / (r.totalQuestions || 0)) * 100)
          : 0,
      practiceMode: r.practiceMode || undefined,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  /**
   * 获取会话详情 (含题目与练习日志)
   */
  async getSessionDetail(userId: number, sessionId: string) {
    // 1. 获取会话基础信息
    const sessionRow = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(practice_sessions.id, sessionId),
        eq(practice_sessions.user_id, userId),
      ),
    });

    if (!sessionRow) return null;

    // 2. 联合查询日志、题目及回顾数据
    const logs = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        questionContent: questions.content,
        options: questions.options,
        correctAnswer: questions.answer,
        userAnswer: practice_logs.user_answer,
        isCorrect: practice_logs.is_correct,
        duration: practice_logs.duration_ms,
        tags: questions.tags,
        source: questions.source,
        explanation: questions.explanation,
        correct_ratio: questions.correct_ratio,
        most_wrong_answer: questions.most_wrong_answer,
        ai_mnemonic: questions.ai_mnemonic,
        material: questions.material,
        material_html: questions.material_html,
        reviewData: session_reviews.review_data,
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .leftJoin(
        session_reviews,
        and(
          eq(practice_logs.session_id, session_reviews.session_id),
          eq(practice_logs.question_id, session_reviews.question_id),
        ),
      )
      .where(eq(practice_logs.session_id, sessionId))
      .all();

    return {
      session: {
        id: String(sessionRow.id),
        sessionName: sessionRow.session_name || undefined,
        totalQuestions: sessionRow.total_questions || 0,
        correctCount: sessionRow.correct_count || 0,
        reviewCount: sessionRow.review_count || 0,
        createdAt: dayjs.utc(sessionRow.created_at).toISOString(),
        accuracy:
          (sessionRow.total_questions || 0) > 0
            ? Math.round(
                ((sessionRow.correct_count || 0) /
                  (sessionRow.total_questions || 0)) *
                  100,
              )
            : 0,
        practiceMode: sessionRow.practice_mode || undefined,
      },
      logs: logs.map((l) => ({
        questionId: l.questionId,
        questionContent: l.questionContent,
        options: safeParseJson(l.options, [] as string[]),
        correctAnswer: l.correctAnswer || "",
        userAnswer: l.userAnswer || "",
        isCorrect: Boolean(l.isCorrect),
        duration: l.duration || 0,
        tags: safeParseJson(l.tags, [] as string[]),
        source: l.source || "",
        explanation: l.explanation || "",
        correctRatio: l.correct_ratio,
        mostWrongAnswer: l.most_wrong_answer,
        reviewData: safeParseJson(l.reviewData, null),
        aiMnemonic: l.ai_mnemonic || null,
        material: l.material || null,
        materialHtml: l.material_html || null,
      })),
    };
  },

  /**
   * 删除练习会话 (级联删除相关日志与回顾)
   */
  async deleteSession(userId: number, sessionId: string) {
    return await drizzleDb.transaction(async (tx) => {
      // 1. 删除回顾
      await tx
        .delete(session_reviews)
        .where(eq(session_reviews.session_id, sessionId));
      // 2. 删除日志
      await tx
        .delete(practice_logs)
        .where(
          and(
            eq(practice_logs.session_id, sessionId),
            eq(practice_logs.user_id, userId),
          ),
        );
      // 3. 删除会话
      const result = await tx
        .delete(practice_sessions)
        .where(
          and(
            eq(practice_sessions.id, sessionId),
            eq(practice_sessions.user_id, userId),
          ),
        );
      return result.rowsAffected > 0;
    });
  },

  /**
   * 重命名会话
   */
  async renameSession(userId: number, sessionId: string, newName: string) {
    const result = await drizzleDb
      .update(practice_sessions)
      .set({ session_name: newName.trim() || null })
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      );
    return result.rowsAffected > 0;
  },

  /**
   * 获取用户所有使用过的练习模式
   */
  async getAvailableModes(userId: number): Promise<string[]> {
    const rows = await drizzleDb
      .select({ mode: practice_sessions.practice_mode })
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.user_id, userId),
          sql`${practice_sessions.practice_mode} IS NOT NULL`,
        ),
      )
      .groupBy(practice_sessions.practice_mode)
      .all();
    return rows.map((r) => r.mode as string).filter(Boolean);
  },

  /**
   * 获取 AI 分析报告 (辅助 Markdown 导出)
   */
  async getAnalysisReport(sessionId: string): Promise<string | null> {
    try {
      // 这里为了兼容性保持原有的 table 动态检查
      const [reportRow] = await drizzleDb.all<Record<string, unknown>>(sql`
                SELECT report FROM analysis_reports WHERE session_id = ${sessionId} LIMIT 1
            `);
      return (reportRow?.report as string) || null;
    } catch {
      return null;
    }
  },
};
