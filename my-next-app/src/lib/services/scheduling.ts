import { db } from '@/lib/db';

export interface Question {
  id: number;
  content: string;
  options: string;
  answer: string;
  explanation: string;
  tags: string;
  dimension: string;
  type: string;
}

/**
 * 计算三种类型题目的权重比例 (40/40/20)
 */
export function calculateSessionRatios(limit: number): { stubborn: number; blind: number; regular: number } {
  const stubborn = Math.floor(limit * 0.4);
  const blind = Math.floor(limit * 0.4);
  const regular = limit - stubborn - blind;
  return { stubborn, blind, regular };
}

export const schedulingService = {
  /**
   * 按 40/40/20 比例生成练习会话（带自动补齐逻辑）
   */
  generateSession: (userId: number, limit: number = 35): Question[] => {
    const { stubborn: stubbornTarget, blind: blindTarget } = calculateSessionRatios(limit);

    // 1. 顽固题：用户观察区标签下的题目
    const stubbornQuestions = db.prepare(`
      SELECT q.* FROM questions q
      JOIN observation_zone oz ON EXISTS (
        SELECT 1 FROM json_each(q.tags) WHERE value = oz.tag_name
      )
      WHERE oz.status = 'active' AND oz.user_id = ?
      ORDER BY RANDOM()
      LIMIT ?
    `).all(userId, stubbornTarget) as Question[];

    const usedIds = stubbornQuestions.map(q => q.id);

    // 2. 盲区题：该用户从未练习过的题目
    const blindQuestions = db.prepare(`
      SELECT q.* FROM questions q
      WHERE NOT EXISTS (
        SELECT 1 FROM practice_logs pl WHERE pl.question_id = q.id AND pl.user_id = ?
      )
      ${usedIds.length > 0 ? `AND q.id NOT IN (${usedIds.join(',')})` : ''}
      ORDER BY RANDOM()
      LIMIT ?
    `).all(userId, blindTarget) as Question[];

    usedIds.push(...blindQuestions.map(q => q.id));

    // 3. 常规题：补齐剩余缺口 (limit - 已选数量)
    const remainingCount = Math.max(0, limit - usedIds.length);
    const regularQuestions = db.prepare(`
      SELECT q.* FROM questions q
      WHERE q.id NOT IN (${usedIds.join(',') || '0'})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(remainingCount) as Question[];

    // 随机打乱合并后的结果
    const session = [...stubbornQuestions, ...blindQuestions, ...regularQuestions];
    return session.sort(() => Math.random() - 0.5);
  }
};
