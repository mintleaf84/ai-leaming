'use server';
import logger from '@/lib/logger';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

import { db,  drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/auth';

/** practice_sessions 表行（查询的字段子集） */
interface PracticeSessionRow {
    id: string;
    totalQuestions: number;
    correctCount: number;
    reviewCount: number;
    createdAt: string;
    practiceMode?: string;
    sessionName?: string;
    accuracy?: number;
}

/** 历史记录列表查询行 */
interface SessionListRow {
    id: string;
    sessionName?: string;
    totalQuestions: number;
    correctCount: number;
    reviewCount: number;
    createdAt: string;
    practiceMode?: string;
}

/** 练习日志 + 题目信息联合查询行 */
interface PracticeLogRow {
    questionId: number;
    questionContent: string;
    options: string;
    correctAnswer: string;
    userAnswer: string;
    isCorrect: number;
    duration: number;
    tags: string;
    source: string;
    explanation: string;
    correct_ratio: number | null;
    most_wrong_answer: string | null;
    ai_mnemonic: string | null;
    material: string | null;
    material_html: string | null;
    reviewData: string | null;
}

// 筛选参数类型
export type HistoryFilter = {
  dateFrom?: string;       // 开始日期 YYYY-MM-DD
  dateTo?: string;         // 结束日期 YYYY-MM-DD
  accuracyMin?: number;    // 最低正确率
  accuracyMax?: number;    // 最高正确率
  mode?: string;           // 练习模式
  page?: number;           // 页码 (从1开始)
  pageSize?: number;       // 每页数量
};

export type SessionHistoryItem = {
  id: string;
  sessionName?: string;      // 会话名称
  totalQuestions: number;
  correctCount: number;
  reviewCount: number;
  createdAt: string;
  accuracy: number;
  practiceMode?: string;   // 练习模式
};

export type PaginatedHistory = {
  items: SessionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getSessionHistoryAction(filter?: HistoryFilter): Promise<PaginatedHistory> {
  try {
    const user = await requireUser();
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 10;
    const offset = (page - 1) * pageSize;

    // 构建动态条件
    const conditions = [eq(drizzleSchema.practice_sessions.user_id, user.id)];

    if (filter?.dateFrom) {
      conditions.push(sql`date(${drizzleSchema.practice_sessions.created_at}) >= date(${filter.dateFrom})`);
    }
    if (filter?.dateTo) {
      conditions.push(sql`date(${drizzleSchema.practice_sessions.created_at}) <= date(${filter.dateTo})`);
    }
    if (filter?.mode) {
      conditions.push(eq(drizzleSchema.practice_sessions.practice_mode, filter.mode));
    }

    const whereCondition = and(...conditions);

    // 获取总数
    const [countResult] = await drizzleDb.select({ value: count() })
      .from(drizzleSchema.practice_sessions)
      .where(whereCondition);

    // 获取分页数据
    const rows = await drizzleDb.select({
      id: drizzleSchema.practice_sessions.id,
      sessionName: drizzleSchema.practice_sessions.session_name,
      totalQuestions: drizzleSchema.practice_sessions.total_questions,
      correctCount: drizzleSchema.practice_sessions.correct_count,
      reviewCount: drizzleSchema.practice_sessions.review_count,
      createdAt: drizzleSchema.practice_sessions.created_at,
      practiceMode: drizzleSchema.practice_sessions.practice_mode
    })
    .from(drizzleSchema.practice_sessions)
    .where(whereCondition)
    .orderBy(desc(drizzleSchema.practice_sessions.created_at))
    .limit(pageSize)
    .offset(offset);

    // 计算正确率并过滤
    let items = rows.map((r: any) => ({
      ...r,
      id: String(r.id),
      sessionName: r.sessionName || undefined,
      createdAt: dayjs.utc(r.createdAt).toISOString(),
      accuracy: r.totalQuestions > 0 ? Math.round((r.correctCount / r.totalQuestions) * 100) : 0
    }));

    // 正确率筛选
    if (filter?.accuracyMin !== undefined) {
      items = items.filter((i: any) => i.accuracy >= filter.accuracyMin!);
    }
    if (filter?.accuracyMax !== undefined) {
      items = items.filter((i: any) => i.accuracy <= filter.accuracyMax!);
    }

    return {
      items,
      total: countResult.value,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.value / pageSize)
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch session history");
    return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }
}

// 获取可用的练习模式列表
export async function getAvailableModesAction(): Promise<string[]> {
  try {
    const user = await requireUser();
    const rows = await drizzleDb.select({ practice_mode: drizzleSchema.practice_sessions.practice_mode })
      .from(drizzleSchema.practice_sessions)
      .where(and(
        eq(drizzleSchema.practice_sessions.user_id, user.id),
        sql`${drizzleSchema.practice_sessions.practice_mode} IS NOT NULL`
      ))
      .groupBy(drizzleSchema.practice_sessions.practice_mode)
      .all();
    return rows.map((r: any) => r.practice_mode as string).filter(Boolean);
  } catch {
    return [];
  }
}

export type SessionDetail = {
  session: SessionHistoryItem;
  logs: {
    questionId: number;           // 题目 ID
    questionContent: string;
    options: string[];           // 选项
    correctAnswer: string;       // 正确答案
    userAnswer: string;
    isCorrect: boolean;
    duration: number;
    tags: string[];              // 考点
    source: string;              // 来源
    explanation: string;         // 解析
    correctRatio: number | null; // 全站正确率
    mostWrongAnswer: string | null; // 易错项
    reviewData?: Record<string, unknown>;
    aiMnemonic?: string | null; // 新增：AI 助记内容
    material?: string | null;   // 新增：材料内容（纯文本）
    materialHtml?: string | null; // 新增：材料内容（HTML）
  }[];
};

export async function getSessionDetailAction(sessionId: string): Promise<SessionDetail | null> {
  try {
    const user = await requireUser();
    const sessionRow = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      ),
      columns: {
        id: true,
        total_questions: true,
        correct_count: true,
        review_count: true,
        created_at: true
      }
    });

    if (!sessionRow) return null;

    const logs = await drizzleDb.select({
      questionId: drizzleSchema.practice_logs.question_id,
      questionContent: drizzleSchema.questions.content,
      options: drizzleSchema.questions.options,
      correctAnswer: drizzleSchema.questions.answer,
      userAnswer: drizzleSchema.practice_logs.user_answer,
      isCorrect: drizzleSchema.practice_logs.is_correct,
      duration: drizzleSchema.practice_logs.duration_ms,
      tags: drizzleSchema.questions.tags,
      source: drizzleSchema.questions.source,
      explanation: drizzleSchema.questions.explanation,
      correct_ratio: drizzleSchema.questions.correct_ratio,
      most_wrong_answer: drizzleSchema.questions.most_wrong_answer,
      ai_mnemonic: drizzleSchema.questions.ai_mnemonic,
      material: drizzleSchema.questions.material,
      material_html: drizzleSchema.questions.material_html,
      reviewData: drizzleSchema.session_reviews.review_data
    })
    .from(drizzleSchema.practice_logs)
    .innerJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
    .leftJoin(drizzleSchema.session_reviews, and(
      eq(drizzleSchema.practice_logs.session_id, drizzleSchema.session_reviews.session_id),
      eq(drizzleSchema.practice_logs.question_id, drizzleSchema.session_reviews.question_id)
    ))
    .where(eq(drizzleSchema.practice_logs.session_id, sessionId))
    .all();

    return {
      session: {
        id: String(sessionRow.id),
        totalQuestions: sessionRow.total_questions || 0,
        correctCount: sessionRow.correct_count || 0,
        reviewCount: sessionRow.review_count || 0,
        createdAt: dayjs.utc(sessionRow.created_at).toISOString(),
        accuracy: (sessionRow.total_questions || 0) > 0 ? Math.round(((sessionRow.correct_count || 0) / (sessionRow.total_questions || 0)) * 100) : 0
      },
      logs: logs.map((l: any) => ({
        questionId: l.questionId,
        questionContent: l.questionContent,
        options: JSON.parse(l.options || '[]'),
        correctAnswer: l.correctAnswer || '',
        userAnswer: l.userAnswer || '',
        isCorrect: !!l.isCorrect,
        duration: l.duration || 0,
        tags: JSON.parse(l.tags || '[]'),
        source: l.source || '',
        explanation: l.explanation || '',
        correctRatio: l.correct_ratio,
        mostWrongAnswer: l.most_wrong_answer,
        reviewData: l.reviewData ? JSON.parse(l.reviewData) : undefined,
        aiMnemonic: l.ai_mnemonic || null,
        material: l.material || null,
        materialHtml: l.material_html || null
      }))
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch session detail");
    return null;
  }
}

export async function deleteSessionAction(sessionId: string) {
  try {
    const user = await requireUser();

    // Check ownership
    const session = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      ),
      columns: { id: true }
    });

    if (!session) {
      return { success: false, message: "权限不足或会话不存在" };
    }

    // 开启事务确保数据完整性
    await drizzleDb.transaction(async (tx: any) => {
      await tx.delete(drizzleSchema.session_reviews).where(eq(drizzleSchema.session_reviews.session_id, sessionId));
      await tx.delete(drizzleSchema.practice_logs).where(and(
        eq(drizzleSchema.practice_logs.session_id, sessionId),
        eq(drizzleSchema.practice_logs.user_id, user.id)
      ));
      await tx.delete(drizzleSchema.practice_sessions).where(and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      ));
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to delete session");
    return { success: false, message: "删除失败，请稍后重试" };
  }
}

/**
 * 重命名练习会话
 */
export async function renameSessionAction(sessionId: string, newName: string) {
  try {
    const user = await requireUser();

    // 检查权限
    const session = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      ),
      columns: { id: true }
    });
    
    if (!session) {
      return { success: false, message: "权限不足或会话不存在" };
    }

    // 更新名称
    await drizzleDb.update(drizzleSchema.practice_sessions)
      .set({ session_name: newName.trim() || null })
      .where(eq(drizzleSchema.practice_sessions.id, sessionId));

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to rename session");
    return { success: false, message: "重命名失败，请稍后重试" };
  }
}

/**
 * 导出练习会话为 Markdown 格式
 */
export async function exportSessionMarkdownAction(sessionId: string): Promise<{
  success: boolean;
  markdown?: string;
  filename?: string;
  error?: string;
}> {
  try {
    // 获取会话详情
    const detail = await getSessionDetailAction(sessionId);
    if (!detail) {
      return { success: false, error: "找不到该练习记录" };
    }

    // 动态导入格式化工具（避免循环依赖）
    const { formatSessionToMarkdown, generateExportFilename } = await import('@/lib/utils/export-markdown');

    // 尝试获取 AI 分析报告
    let analysisReport: string | null = null;
    try {
      const reportRow = db.prepare(`
        SELECT report FROM analysis_reports WHERE session_id = ?
      `).get(sessionId) as { report: string } | undefined;
      if (reportRow) {
        analysisReport = reportRow.report;
      }
    } catch {
      // 分析报告表可能不存在，忽略错误
    }

    // 格式化为 Markdown
    const markdown = formatSessionToMarkdown(detail, analysisReport);
    const filename = generateExportFilename(detail.session.createdAt);

    return { success: true, markdown, filename };
  } catch (error) {
    logger.error({ err: error }, "Failed to export session");
    return { success: false, error: "导出失败，请稍后重试" };
  }
}

