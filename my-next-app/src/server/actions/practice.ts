'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { practiceService } from '@/lib/services/practice';
import { Question } from "@/types";
import { KnowledgeTreeService, KnowledgeNode } from '@/lib/services/knowledge-tree';

/**
 * 获取或恢复练习会话
 */
export async function getPracticeSessionAction(forceNew: boolean = false) {
  try {
    const user = await requireUser();
    return await practiceService.getOrCreateSession(user.id, forceNew);
  } catch (error) {
    logger.error({ err: error }, 'Action: getPracticeSessionAction failed');
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
    return await practiceService.submitAnswer(
        user.id, 
        sessionId || null, 
        questionId, 
        userAnswer, 
        isCorrect, 
        duration
    );
  } catch (e) {
    logger.error({ err: e }, "Action: submitAnswerAction failed");
    return { success: false };
  }
}

/**
 * 获取知识体系树
 */
export async function getKnowledgeTreeAction(): Promise<KnowledgeNode[]> {
  try {
    // 依然委托给专门的 KnowledgeTreeService
    const { drizzleDb, drizzleSchema } = await import('@/lib/db');
    const { sql } = await import('drizzle-orm');
    
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
 * 根据自定义配置创建会话
 */
export async function getPracticeSessionByConfigAction(config: any) {
  try {
    const user = await requireUser();
    
    // 如果 practiceService 还没有实现 createSessionByConfig，暂时保持原有调用逻辑
    // 但迁移到 Service 内部是下一步的目标
    const { generateSessionByConfig } = await import('@/lib/practice/practice-scheduling');
    const rawQuestions = generateSessionByConfig(config, user.id);

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], sessionId: '', config };
    }

    // 复用 Service 的会话创建能力
    const { drizzleDb, drizzleSchema } = await import('@/lib/db');
    const sessionId = Math.random().toString(36).substring(2, 15);
    
    await drizzleDb.insert(drizzleSchema.practice_sessions).values({
      id: sessionId,
      user_id: user.id,
      total_questions: rawQuestions.length,
      questions_json: JSON.stringify(rawQuestions),
      practice_mode: config.mode,
      is_demo: 0
    });

    return { questions: rawQuestions, sessionId, config };
  } catch (error) {
    logger.error({ err: error }, 'Action: getPracticeSessionByConfigAction failed');
    throw new Error('无法创建配置练习会话，请稍后重试。');
  }
}

/**
 * 以后台 ID 获取完整会话内容
 */
export async function getSessionByIdAction(sessionId: string) {
  try {
    const user = await requireUser();
    return await practiceService.getSessionById(user.id, sessionId);
  } catch (error) {
    logger.error({ err: error }, 'Action: getSessionByIdAction failed');
    return null;
  }
}

/**
 * 保存会话回顾信息
 */
export async function saveSessionReviewAction(sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
  try {
    const { drizzleDb, drizzleSchema } = await import('@/lib/db');
    const { and, eq, sql } = await import('drizzle-orm');
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
