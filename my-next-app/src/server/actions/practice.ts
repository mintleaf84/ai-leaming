'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { Question, Dimension } from "@/types";
import type { PracticeMode } from "@/types";
import { safeGet, safeAll } from '@/lib/db/safe-query';
import { PracticeSessionRowSchema, QuestionSchema, QuestionRowSchema } from '@/lib/schemas';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/auth';

// ===== 演示模式辅助函数 =====

/** 检查全局演示模式是否开启 */
function isDemoModeEnabled(): boolean {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'demo_mode_enabled'").get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch {
    return false;
  }
}

/** 确保 is_demo 列存在 */
function ensureDemoColumn() {
  try {
    db.prepare("ALTER TABLE practice_sessions ADD COLUMN is_demo INTEGER DEFAULT 0").run();
  } catch { /* 列已存在 */ }
}

/** 获取或创建演示会话：返回固定题目集并重置进度 */
async function getDemoSession(userId: string | number): Promise<{
  questions: Question[];
  sessionId: string;
} | null> {
  ensureDemoColumn();

  // 查找已有的演示会话
  const existing = db.prepare(`
    SELECT id, questions_json FROM practice_sessions
    WHERE user_id = ? AND is_demo = 1
    ORDER BY created_at DESC LIMIT 1
  `).get(userId) as { id: string; questions_json: string } | undefined;

  if (existing && existing.questions_json) {
    // 清空该会话的答题记录，让用户从头开始
    db.prepare('DELETE FROM practice_logs WHERE session_id = ?').run(existing.id);
    db.prepare('UPDATE practice_sessions SET correct_count = 0 WHERE id = ?').run(existing.id);
    logger.info({ value: existing.id }, '[DemoMode] 复用演示会话');

    let questions: Question[];
    try {
      questions = typeof existing.questions_json === 'string'
        ? JSON.parse(existing.questions_json)
        : existing.questions_json;
    } catch {
      return null;
    }
    return { questions, sessionId: existing.id };
  }

  // 没有演示会话，创建一个新的
  const sessionId = 'demo-' + Math.random().toString(36).substring(2, 12);
  const questions = safeAll(
    db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 10'),
    [],
    QuestionRowSchema
  );

  if (!questions || questions.length === 0) return null;

  // 确保 questions_json 和 practice_mode 列存在
  try { db.prepare("ALTER TABLE practice_sessions ADD COLUMN questions_json TEXT").run(); } catch { }
  try { db.prepare("ALTER TABLE practice_sessions ADD COLUMN practice_mode TEXT").run(); } catch { }

  db.prepare(`
    INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, practice_mode, is_demo)
    VALUES (?, ?, ?, ?, 'smart', 1)
  `).run(sessionId, userId, questions.length, JSON.stringify(questions));

  logger.info({ value: sessionId }, '[DemoMode] 创建新演示会话');
  return { questions, sessionId };
}

export async function getPracticeSessionAction(forceNew: boolean = false): Promise<{
  questions: Question[];
  sessionId: string;
  resumed?: boolean;
  completedCount?: number;
}> {
  try {
    const user = await requireUser();

    // 演示模式拦截：如果全局开启，返回固定的演示数据集
    if (isDemoModeEnabled()) {
      const demoResult = await getDemoSession(user.id);
      if (demoResult) return { ...demoResult, resumed: false, completedCount: 0 };
    }

    // 0. Migration: Ensure questions_json column exists
    try {
      db.prepare("ALTER TABLE practice_sessions ADD COLUMN questions_json TEXT").run();
    } catch (e) { /* ignore if column exists */ }

    // 1. Try to resume latest session
    if (!forceNew) {
      const lastSession = safeGet(
        db.prepare(`
          SELECT * FROM practice_sessions 
          WHERE user_id = ? AND created_at > datetime('now', '-1 day') 
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

        // If not finished (logs < total), resume it
        if (logCount && logCount.count < lastSession.total_questions) {
          // questions_json is already parsed by Schema
          const questions = lastSession.questions_json as unknown as Question[];
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
    const questions = safeAll(
      db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 10'),
      [],
      QuestionRowSchema
    );

    if (!questions || questions.length === 0) {
      return { questions: [], sessionId: "" };
    }

    // Create session in DB with questions_json
    // Use QuestionRowSchema parsed result which has correct types for JSON
    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json) 
      VALUES (?, ?, ?, ?)
    `).run(sessionId, user.id, questions.length, JSON.stringify(questions));

    return { questions, sessionId };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create/resume practice session');
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

export async function saveSessionReviewAction(sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
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
    logger.error({ err: e }, "Failed to save review data");
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
    logger.error({ err: error }, '获取标签失败');
    return [];
  }
}

export interface KnowledgeParams {
  name: string;
  path: string; // Full path for querying
  children: KnowledgeParams[];
  count: number; // Number of questions under this node (recursive)
}

/**
 * 获取知识点树形结构
 * Tags format: "Subject/Chapter/Topic"
 */
export async function getKnowledgeTreeAction(): Promise<KnowledgeParams[]> {
  try {
    const result = db.prepare(`
      SELECT DISTINCT value as tag, COUNT(*) as count
      FROM questions, json_each(questions.tags)
      GROUP BY value
      ORDER BY value
    `).all() as { tag: string; count: number }[];

    const root: KnowledgeParams[] = [];

    result.forEach(({ tag, count }) => {
      const parts = tag.split('/');
      let currentLevel = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let existingNode = currentLevel.find(n => n.name === part);

        if (!existingNode) {
          existingNode = {
            name: part,
            path: currentPath,
            children: [],
            count: 0 // Will accumulate later or simplified here
          };
          currentLevel.push(existingNode);
        }

        // Simple addition: add the count of this specific tag occurrence to the node
        // Note: multiple tags might share parents. Ideally we sum them up.
        // For simplicity, we just ensure the node exists. The count logic can be refined if needed.
        if (index === parts.length - 1) {
          existingNode.count += count;
        }

        currentLevel = existingNode.children;
      });
    });

    // Helper to sum up counts recursively
    const calculateCounts = (nodes: KnowledgeParams[]): number => {
      let sum = 0;
      for (const node of nodes) {
        const childrenSum = calculateCounts(node.children);
        node.count = (node.count || 0) + childrenSum;
        sum += node.count;
      }
      return sum;
    }
    // Note: The above count logic is imperfect because a parent might not have its own direct questions
    // but we want to show how many questions are under it.
    // Let's refine: leaf nodes have accurate counts from SQL. 
    // Parent nodes should sum their children's counts + their own direct count (if any).

    // Re-implement accumulation correctly
    const recalculateTreeCounts = (nodes: KnowledgeParams[]): number => {
      let total = 0;
      for (const node of nodes) {
        // Find the original count from result if this path matches exactly?
        // Actually the 'result' loop already set count for exact matches.
        // Now we just add up children.
        let myTotal = node.count;
        if (node.children.length > 0) {
          // For intermediate nodes, their 'count' is purely from children in this simple model 
          // unless they are also tagged directly (which the loop handles).
          // However, we want 'count' to represent "total available questions under this branch".
          // So we sum up children.
          const childrenTotal = recalculateTreeCounts(node.children);
          node.count += childrenTotal;
        }
        total += node.count;
      }
      return total;
    }

    recalculateTreeCounts(root);

    return root;
  } catch (error) {
    logger.error({ err: error }, '获取知识树失败');
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

    // 演示模式拦截
    if (isDemoModeEnabled()) {
      const demoResult = await getDemoSession(user.id);
      if (demoResult) return { ...demoResult, config };
    }

    const { generateSessionByConfig } = await import('@/lib/practice/practice-scheduling');

    // 构建配置
    const practiceConfig = {
      mode: config.mode as PracticeMode,
      limit: config.limit,
      types: config.types,
      tags: config.tags,
      dimensions: config.dimensions,
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
    logger.error({ err: error }, '创建练习会话失败');
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
    const session = safeGet(
      db.prepare(`
        SELECT * FROM practice_sessions 
        WHERE id = ? AND user_id = ?
      `),
      [sessionId, user.id],
      PracticeSessionRowSchema
    );

    if (!session || !session.questions_json) {
      return null;
    }

    // 解析 questions_json (already parsed by Schema)
    let questionsData = session.questions_json as unknown[];

    // 检查是 ID 数组还是完整题目对象数组
    if (questionsData.length > 0 && typeof questionsData[0] === 'string') {
      // 是字符串 ID 数组，需要查询完整题目
      const placeholders = questionsData.map(() => '?').join(',');
      const rawQuestions = safeAll(
        db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`),
        questionsData,
        QuestionRowSchema
      );
      questionsData = rawQuestions;
    } else if (questionsData.length > 0 && typeof questionsData[0] === 'number') {
      // 是数字 ID 数组
      const placeholders = questionsData.map(() => '?').join(',');
      const rawQuestions = safeAll(
        db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`),
        questionsData,
        QuestionRowSchema
      );
      questionsData = rawQuestions;
    } else {
      // 已经是完整题目对象，通过 Zod 校验
      // questionsData is already parsed Question[] mostly, but we can re-validate if needed.
      // Assuming trust logic from Schema transform.
    }

    // 获取已完成题目数
    const logResult = safeGet(
      db.prepare('SELECT count(*) as count FROM practice_logs WHERE session_id = ?'),
      [sessionId],
      z.object({ count: z.number() })
    );

    return {
      questions: questionsData as Question[],
      sessionId: session.id,
      completedCount: logResult?.count || 0,
      practiceMode: session.practice_mode || undefined // Handle null
    };
  } catch (error) {
    logger.error({ err: error }, '获取会话失败');
    return null;
  }
}
