'use server';

import logger from '@/lib/logger';
import db, { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, gt, sql } from 'drizzle-orm';
import { Question, Dimension } from "@/types";
import type { PracticeMode } from "@/types";
import { safeGet, safeAll } from '@/lib/db/safe-query';
import { PracticeSessionRowSchema, QuestionRowSchema } from '@/lib/schemas';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';

// 导入解耦后的服务
import { DemoService } from '@/lib/practice/demo';
import { KnowledgeTreeService, KnowledgeNode } from '@/lib/services/knowledge-tree';

/**
 * 将数据库原始题目行映射为业务 Question 类型
 */
/**
 * 将数据库原始题目行映射为业务 Question 类型
 */
function mapQuestion(q: any): Question {
  try {
    return QuestionRowSchema.parse(q);
  } catch (err) {
    logger.error({ err, questionId: q.id }, 'Question mapping failed');
    // 回退逻辑，确保程序不崩溃
    return {
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : (q.tags || []),
      type: q.type || 'single',
      dimension: q.dimension || 'knowledge'
    } as Question;
  }
}


/**
 * 获取或恢复练习会话
 */
export async function getPracticeSessionAction(forceNew: boolean = false): Promise<{
  questions: Question[];
  sessionId: string;
  resumed?: boolean;
  completedCount?: number;
}> {
  try {
    const user = await requireUser();

    // 1. 演示模式拦截
    if (DemoService.isDemoModeEnabled(db)) {
      const demoResult = await DemoService.getDemoSession(db, user.id);
      if (demoResult) return { ...demoResult, resumed: false, completedCount: 0 };
    }

    // 2. 尝试恢复最近 24 小时内未完成的会话
    if (!forceNew) {
      const lastSession = await drizzleDb.query.practice_sessions.findFirst({
        where: and(
          eq(drizzleSchema.practice_sessions.user_id, user.id),
          eq(drizzleSchema.practice_sessions.is_demo, 0),
          gt(drizzleSchema.practice_sessions.created_at, sql`datetime('now', '-1 day')`)
        ),
        orderBy: [desc(drizzleSchema.practice_sessions.created_at)]
      });

      if (lastSession && lastSession.questions_json) {
        const logResult = await drizzleDb.select({ count: sql<number>`count(*)` })
          .from(drizzleSchema.practice_logs)
          .where(eq(drizzleSchema.practice_logs.session_id, lastSession.id))
          .get();

        if (logResult && logResult.count < (lastSession.total_questions || 0)) {
          return {
            questions: JSON.parse(lastSession.questions_json) as Question[],
            sessionId: lastSession.id,
            resumed: true,
            completedCount: logResult.count
          };
        }
      }
    }

    const sessionId = Math.random().toString(36).substring(2, 15);
    const rawQuestions = await drizzleDb.select()
      .from(drizzleSchema.questions)
      .orderBy(sql`RANDOM()`)
      .limit(10);

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [] as Question[], sessionId: "" };
    }

    const questions = rawQuestions.map((q: any) => mapQuestion(q));

    await drizzleDb.insert(drizzleSchema.practice_sessions).values({
      id: sessionId,
      user_id: user.id,
      total_questions: questions.length,
      questions_json: JSON.stringify(questions),
      is_demo: 0
    });

    return { questions, sessionId };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create/resume practice session');
    throw new Error('无法创建练习会话，请稍后重试。');
  }
}

/**
 * 提交题目答案
 */
export async function submitAnswerAction(
  questionId: number, 
  userAnswer: string, 
  isCorrect: boolean, 
  duration: number, 
  sessionId?: string
) {
  try {
    const user = await requireUser();

    // 1. 记录答题日志
    await drizzleDb.insert(drizzleSchema.practice_logs).values({
      session_id: sessionId || null,
      user_id: user.id,
      question_id: questionId,
      user_answer: userAnswer,
      is_correct: isCorrect,
      duration_ms: duration
    });

    // 2. 更新会话正确数
    if (sessionId) {
      await drizzleDb.update(drizzleSchema.practice_sessions)
        .set({ correct_count: sql`${drizzleSchema.practice_sessions.correct_count} + ${isCorrect ? 1 : 0}` })
        .where(and(
          eq(drizzleSchema.practice_sessions.id, sessionId),
          eq(drizzleSchema.practice_sessions.user_id, user.id)
        ));
    }

    // 3. 异步更新掌握度
    const q = await drizzleDb.query.questions.findFirst({
      where: eq(drizzleSchema.questions.id, questionId),
      columns: { tags: true, dimension: true }
    });

    if (q && q.tags) {
      const tags = JSON.parse(q.tags);
      const { masteryService } = await import('@/lib/services/mastery');

      tags.forEach((tag: string) => {
        masteryService.updateMastery(user.id, tag, q.dimension as Dimension, isCorrect);
      });
    }

    return { success: true };
  } catch (e) {
    logger.error({ err: e }, "Submit answer failed");
    return { success: false };
  }
}

/**
 * 获取知识体系树
 */
export async function getKnowledgeTreeAction(): Promise<KnowledgeNode[]> {
  try {
    const rawTags = await drizzleDb.select({
      tag: sql<string>`json_each.value`,
      count: sql<number>`count(*)`
    })
    .from(sql`${drizzleSchema.questions} AS q, json_each(q.tags)`)
    .groupBy(sql`json_each.value`)
    .orderBy(sql`json_each.value`)
    .all();

    return KnowledgeTreeService.buildKnowledgeTree(rawTags as any);
  } catch (error) {
    logger.error({ err: error }, '获取知识树失败');
    return [];
  }
}

/**
 * 根据自定义配置创建会话 (如特定标签、模式)
 */
export async function getPracticeSessionByConfigAction(config: {
  mode: string;
  limit: number;
  types?: string[];
  tags?: string[];
  dimensions?: string[];
  enableReview?: boolean;
  enableTimer?: boolean;
}) {
  try {
    const user = await requireUser();

    // 演示模式拦截
    if (DemoService.isDemoModeEnabled(db)) {
      const demoResult = await DemoService.getDemoSession(db, user.id);
      if (demoResult) return { ...demoResult, config };
    }

    // 调用调度算法生成题目
    const { generateSessionByConfig } = await import('@/lib/practice/practice-scheduling');
    const rawQuestions = generateSessionByConfig({
      mode: config.mode as PracticeMode,
      limit: config.limit,
      types: config.types as any,
      tags: config.tags,
      dimensions: config.dimensions as any
    }, user.id);

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], sessionId: '', config };
    }

    const questions = rawQuestions.map((q: any) => mapQuestion(q));

    const sessionId = Math.random().toString(36).substring(2, 15);
    await drizzleDb.insert(drizzleSchema.practice_sessions).values({
      id: sessionId,
      user_id: user.id,
      total_questions: questions.length,
      questions_json: JSON.stringify(questions),
      practice_mode: config.mode,
      is_demo: 0
    });

    return { questions, sessionId, config };
  } catch (error) {
    logger.error({ err: error }, '创建配置练习会话失败');
    throw new Error('无法创建练习会话，请稍后重试。');
  }
}

/**
 * 以后台 ID 获取完整会话内容
 */
export async function getSessionByIdAction(sessionId: string) {
  try {
    const user = await requireUser();

    const session = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      )
    });

    if (!session || !session.questions_json) return null;

    let questions = session.questions_json ? JSON.parse(session.questions_json) : [];
    
    // 如果存储的是 ID 列表，则查询完整题目 (向下兼容旧逻辑)
    if (questions.length > 0 && (typeof questions[0] === 'string' || typeof questions[0] === 'number')) {
      questions = await drizzleDb.select()
        .from(drizzleSchema.questions)
        .where(sql`${drizzleSchema.questions.id} IN (${sql.join(questions, sql`, `)})`);
    }

    const logResult = await drizzleDb.select({ count: sql<number>`count(*)` })
      .from(drizzleSchema.practice_logs)
      .where(eq(drizzleSchema.practice_logs.session_id, sessionId))
      .get();

    return {
      questions: questions.map((q: any) => mapQuestion(q)),
      sessionId: session.id,
      completedCount: logResult?.count || 0,
      practiceMode: session.practice_mode || undefined
    };
  } catch (error) {
    logger.error({ err: error }, '获取会话失败');
    return null;
  }
}

// 保留其他简单的 Action...
export async function saveSessionReviewAction(sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
  try {
    const user = await requireUser();
    await drizzleDb.insert(drizzleSchema.session_reviews).values({
      session_id: sessionId,
      question_id: questionId,
      review_data: JSON.stringify(reviewData)
    });

    await drizzleDb.update(drizzleSchema.practice_sessions)
      .set({ review_count: sql`${drizzleSchema.practice_sessions.review_count} + 1` })
      .where(and(
        eq(drizzleSchema.practice_sessions.id, sessionId),
        eq(drizzleSchema.practice_sessions.user_id, user.id)
      ));
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function getAvailableTagsAction(): Promise<string[]> {
  const result = await drizzleDb.selectDistinct({
    tag: sql<string>`json_each.value`
  })
  .from(sql`${drizzleSchema.questions} AS q, json_each(q.tags)`)
  .orderBy(sql`json_each.value`)
  .all();
  
  return result.map(r => r.tag);
}
