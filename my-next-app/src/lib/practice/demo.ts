/**
 * 演示模式服务
 */

import Database from 'better-sqlite3';
import logger from '@/lib/logger';
import { Question } from '@/types';
import { QuestionRowSchema } from '@/lib/schemas';
import { safeAll } from '@/lib/db/safe-query';

export const DemoService = {
  /** 检查全局演示模式是否开启 */
  isDemoModeEnabled(db: Database.Database): boolean {
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'demo_mode_enabled'").get() as { value: string } | undefined;
      return row?.value === 'true';
    } catch {
      return false;
    }
  },

  /** 获取或创建演示会话 */
  async getDemoSession(db: Database.Database, userId: string | number): Promise<{
    questions: Question[];
    sessionId: string;
  } | null> {
    // 1. 查找已有的演示会话
    const existing = db.prepare(`
      SELECT id, questions_json FROM practice_sessions
      WHERE user_id = ? AND is_demo = 1
      ORDER BY created_at DESC LIMIT 1
    `).get(userId) as { id: string; questions_json: string } | undefined;

    if (existing && existing.questions_json) {
      // 重置演示进度，让用户每次进入都能从头体验
      db.prepare('DELETE FROM practice_logs WHERE session_id = ?').run(existing.id);
      db.prepare('UPDATE practice_sessions SET correct_count = 0 WHERE id = ?').run(existing.id);
      
      logger.info({ sessionId: existing.id }, '[DemoMode] 重置并复用演示会话');

      try {
        const questions = typeof existing.questions_json === 'string'
          ? JSON.parse(existing.questions_json)
          : existing.questions_json;
        return { questions, sessionId: existing.id };
      } catch (e) {
        logger.error({ err: e }, '[DemoMode] 解析演示会话题目失败');
        return null;
      }
    }

    // 2. 创建新演示会话 (从题库随机选 10 题)
    const sessionId = `demo-${Math.random().toString(36).substring(2, 12)}`;
    const questions = safeAll(
      db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 10'),
      [],
      QuestionRowSchema
    );

    if (!questions || questions.length === 0) return null;

    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, practice_mode, is_demo)
      VALUES (?, ?, ?, ?, 'smart', 1)
    `).run(sessionId, userId, questions.length, JSON.stringify(questions));

    logger.info({ sessionId }, '[DemoMode] 创建新演示会话');
    return { questions, sessionId };
  }
};
