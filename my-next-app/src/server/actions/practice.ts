'use server';

import db from '@/lib/db';
import { Question } from '@/lib/types';
import { schedulingService } from '@/lib/scheduling-service';
import { requireUser } from '@/lib/auth';

export async function getPracticeSessionAction(forceNew: boolean = false): Promise<{
  questions: Question[];
  sessionId: string;
  resumed?: boolean;
  completedCount?: number;
}> {
  try {
    const user = await requireUser();
    // 0. Migration: Ensure questions_json column exists
    try {
      db.prepare("ALTER TABLE practice_sessions ADD COLUMN questions_json TEXT").run();
    } catch (e) { /* ignore if column exists */ }

    // 1. Try to resume latest session
    if (!forceNew) {
      const lastSession = db.prepare(`
        SELECT * FROM practice_sessions 
        WHERE user_id = ? AND created_at > datetime('now', '-1 day') 
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id) as any;

      if (lastSession && lastSession.questions_json) {
        const logCount = db.prepare('SELECT count(*) as count FROM practice_logs WHERE session_id = ?').get(lastSession.id) as { count: number };

        // If not finished (logs < total), resume it
        if (logCount.count < lastSession.total_questions) {
          const questions = JSON.parse(lastSession.questions_json);
          return {
            questions,
            sessionId: lastSession.id,
            resumed: true,
            completedCount: logCount.count
          };
        }
      }
    }

    // 2. Create NEW Session
    const sessionId = Math.random().toString(36).substring(2, 15);

    // Use scheduling service logic if possible, or fallback to random
    // For now keeping the simple random logic but improving it to use questions_json
    const stmt = db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 10');
    const rawQuestions = stmt.all() as any[];

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], sessionId: "" };
    }

    const questions = rawQuestions.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
    }));

    // Create session in DB with questions_json
    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json) 
      VALUES (?, ?, ?, ?)
    `).run(sessionId, user.id, questions.length, JSON.stringify(questions));

    return { questions, sessionId };
  } catch (error) {
    console.error('Failed to create/resume practice session:', error);
    throw new Error('无法创建练习会话，请稍后重试。');
  }
}

export async function submitAnswerAction(questionId: number, userAnswer: string, isCorrect: boolean, duration: number, sessionId?: string) {
  try {
    const user = await requireUser();

    // 1. Log to practice_logs
    db.prepare(`
          INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(sessionId || null, user.id, questionId, userAnswer, isCorrect ? 1 : 0, duration);

    // 2. Update session stats if applicable
    if (sessionId) {
      db.prepare(`
            UPDATE practice_sessions 
            SET correct_count = correct_count + ?
            WHERE id = ? AND user_id = ?
          `).run(isCorrect ? 1 : 0, sessionId, user.id);
    }

    // 3. Update mastery
    const q = db.prepare('SELECT tags, dimension FROM questions WHERE id = ?').get(questionId) as { tags: string, dimension: string };
    if (q) {
      const tags = JSON.parse(q.tags);
      const { masteryService } = await import('@/lib/mastery-service');

      tags.forEach((tag: string) => {
        masteryService.updateMastery(user.id, tag, q.dimension as any, isCorrect);
      });
    }
    return { success: true };
  } catch (e) {
    console.error("Submit answer failed", e);
    return { success: false };
  }
}

export async function saveSessionReviewAction(sessionId: string, questionId: number, reviewData: any) {
  try {
    const user = await requireUser();

    db.prepare(`
      INSERT INTO session_reviews (session_id, question_id, review_data)
      VALUES (?, ?, ?)
    `).run(sessionId, questionId, JSON.stringify(reviewData));

    db.prepare(`
      UPDATE practice_sessions 
      SET review_count = review_count + 1
      WHERE id = ? AND user_id = ?
    `).run(sessionId, user.id);

    return { success: true };
  } catch (e) {
    console.error("Failed to save review data", e);
    return { success: false };
  }
}

/**
 * 获取所有可用的知识点标签
 */
export async function getAvailableTagsAction(): Promise<string[]> {
  try {
    const result = db.prepare(`
      SELECT DISTINCT value as tag
      FROM questions, json_each(questions.tags)
      ORDER BY value
    `).all() as { tag: string }[];

    return result.map(r => r.tag);
  } catch (error) {
    console.error('获取标签失败', error);
    return [];
  }
}

/**
 * 根据配置创建练习会话
 */
export async function getPracticeSessionByConfigAction(config: {
  mode: string;
  limit: number;
  types?: string[];
  tags?: string[];
  dimensions?: string[];
  enableReview?: boolean;
  enableTimer?: boolean;
}): Promise<{
  questions: Question[];
  sessionId: string;
  config: typeof config;
}> {
  try {
    const user = await requireUser();
    const { generateSessionByConfig } = await import('@/lib/practice/practice-scheduling');

    // 构建配置
    const practiceConfig = {
      mode: config.mode as any,
      limit: config.limit,
      types: config.types as any,
      tags: config.tags,
      dimensions: config.dimensions as any,
      enableReview: config.enableReview ?? true,
      enableTimer: config.enableTimer ?? false
    };

    // 生成题目
    const rawQuestions = generateSessionByConfig(practiceConfig, user.id);

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], sessionId: '', config };
    }

    // 解析 JSON 字段
    const questions = rawQuestions.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
    })) as Question[];

    // 创建会话
    const sessionId = Math.random().toString(36).substring(2, 15);

    // 确保 questions_json 列存在
    try {
      db.prepare("ALTER TABLE practice_sessions ADD COLUMN questions_json TEXT").run();
    } catch (e) { /* ignore if exists */ }

    try {
      db.prepare("ALTER TABLE practice_sessions ADD COLUMN practice_mode TEXT").run();
    } catch (e) { /* ignore if exists */ }

    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, practice_mode) 
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, user.id, questions.length, JSON.stringify(questions), config.mode);

    return { questions, sessionId, config };
  } catch (error) {
    console.error('创建练习会话失败:', error);
    throw new Error('无法创建练习会话，请稍后重试。');
  }
}

/**
 * 根据 sessionId 获取已创建的练习会话
 * 用于错题本等场景：先创建会话，再跳转到练习页面
 */
export async function getSessionByIdAction(sessionId: string): Promise<{
  questions: Question[];
  sessionId: string;
  completedCount: number;
  practiceMode?: string;
} | null> {
  try {
    const user = await requireUser();

    // 查询会话
    const session = db.prepare(`
      SELECT * FROM practice_sessions 
      WHERE id = ? AND user_id = ?
    `).get(sessionId, user.id) as any;

    if (!session || !session.questions_json) {
      return null;
    }

    // 解析 questions_json
    let questionsData = JSON.parse(session.questions_json);

    // 检查是 ID 数组还是完整题目对象数组
    if (questionsData.length > 0 && typeof questionsData[0] === 'string') {
      // 是字符串 ID 数组，需要查询完整题目
      const placeholders = questionsData.map(() => '?').join(',');
      const rawQuestions = db.prepare(`
        SELECT * FROM questions WHERE id IN (${placeholders})
      `).all(...questionsData) as any[];

      questionsData = rawQuestions.map(q => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
      }));
    } else if (questionsData.length > 0 && typeof questionsData[0] === 'number') {
      // 是数字 ID 数组
      const placeholders = questionsData.map(() => '?').join(',');
      const rawQuestions = db.prepare(`
        SELECT * FROM questions WHERE id IN (${placeholders})
      `).all(...questionsData) as any[];

      questionsData = rawQuestions.map(q => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
      }));
    } else {
      // 已经是完整题目对象，确保 JSON 字段已解析
      questionsData = questionsData.map((q: any) => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
      }));
    }

    // 获取已完成题目数
    const logCount = db.prepare(
      'SELECT count(*) as count FROM practice_logs WHERE session_id = ?'
    ).get(sessionId) as { count: number };

    return {
      questions: questionsData as Question[],
      sessionId: session.id,
      completedCount: logCount.count,
      practiceMode: session.practice_mode
    };
  } catch (error) {
    console.error('获取会话失败:', error);
    return null;
  }
}
