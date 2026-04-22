'use server';

import logger from '@/lib/logger';
import db from '@/lib/db';
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
      const lastSession = safeGet(
        db.prepare(`
          SELECT * FROM practice_sessions 
          WHERE user_id = ? AND is_demo = 0 AND created_at > datetime('now', '-1 day') 
          ORDER BY created_at DESC LIMIT 1
        `),
        [user.id],
        PracticeSessionRowSchema
      );

      if (lastSession && lastSession.questions_json) {
        const logCount = safeGet(
          db.prepare('SELECT count(*) as count FROM practice_logs WHERE session_id = ?'),
          [lastSession.id],
          z.object({ count: z.number() })
        );

        if (logCount && logCount.count < lastSession.total_questions) {
          return {
            questions: lastSession.questions_json as unknown as Question[],
            sessionId: lastSession.id,
            resumed: true,
            completedCount: logCount.count
          };
        }
      }
    }

    // 3. 创建全新随机练习会话
    const sessionId = Math.random().toString(36).substring(2, 15);
    const questions = safeAll(
      db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 10'),
      [],
      QuestionRowSchema
    );

    if (!questions || questions.length === 0) {
      return { questions: [], sessionId: "" };
    }

    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, is_demo) 
      VALUES (?, ?, ?, ?, 0)
    `).run(sessionId, user.id, questions.length, JSON.stringify(questions));

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
    db.prepare(`
      INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId || null, user.id, questionId, userAnswer, isCorrect ? 1 : 0, duration);

    // 2. 更新会话正确数
    if (sessionId) {
      db.prepare(`
        UPDATE practice_sessions 
        SET correct_count = correct_count + ?
        WHERE id = ? AND user_id = ?
      `).run(isCorrect ? 1 : 0, sessionId, user.id);
    }

    // 3. 异步更新掌握度 (通过 import 避免循环依赖)
    const q = db.prepare('SELECT tags, dimension FROM questions WHERE id = ?').get(questionId) as { tags: string, dimension: string };
    if (q) {
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
    const rawTags = db.prepare(`
      SELECT DISTINCT value as tag, COUNT(*) as count
      FROM questions, json_each(questions.tags)
      GROUP BY value
      ORDER BY value
    `).all() as { tag: string; count: number }[];

    return KnowledgeTreeService.buildKnowledgeTree(rawTags);
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

    const questions = rawQuestions.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
    })) as Question[];

    const sessionId = Math.random().toString(36).substring(2, 15);
    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, practice_mode, is_demo) 
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(sessionId, user.id, questions.length, JSON.stringify(questions), config.mode);

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

    const session = safeGet(
      db.prepare(`SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?`),
      [sessionId, user.id],
      PracticeSessionRowSchema
    );

    if (!session || !session.questions_json) return null;

    let questions = session.questions_json as unknown as any[];
    
    // 如果存储的是 ID 列表，则查询完整题目 (向下兼容旧逻辑)
    if (questions.length > 0 && (typeof questions[0] === 'string' || typeof questions[0] === 'number')) {
      const placeholders = questions.map(() => '?').join(',');
      questions = safeAll(
        db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`),
        questions,
        QuestionRowSchema
      );
    }

    const logResult = safeGet(
      db.prepare('SELECT count(*) as count FROM practice_logs WHERE session_id = ?'),
      [sessionId],
      z.object({ count: z.number() })
    );

    return {
      questions: questions as Question[],
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
    db.prepare(`INSERT INTO session_reviews (session_id, question_id, review_data) VALUES (?, ?, ?)`).run(sessionId, questionId, JSON.stringify(reviewData));
    db.prepare(`UPDATE practice_sessions SET review_count = review_count + 1 WHERE id = ? AND user_id = ?`).run(sessionId, user.id);
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function getAvailableTagsAction(): Promise<string[]> {
  const result = db.prepare(`SELECT DISTINCT value as tag FROM questions, json_each(questions.tags) ORDER BY value`).all() as { tag: string }[];
  return result.map(r => r.tag);
}
