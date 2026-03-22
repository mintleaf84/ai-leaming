import db from '@/lib/db';

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
   * Generate a session of questions based on 40/40/20 rule
   */
  generateSession: (limit: number = 35): Question[] => {
    const { stubborn: stubbornCount, blind: blindCount, regular: regularCount } = calculateSessionRatios(limit);

    // 1. Stubborn Questions (High error rate or in observation zone tags)
    // For simplicity: Questions where user has missed them before OR questions belonging to tags in observation_zone
    const stubbornQuestions = db.prepare(`
      SELECT q.* FROM questions q
      JOIN observation_zone oz ON EXISTS (
        SELECT 1 FROM json_each(q.tags) WHERE value = oz.tag_name
      )
      WHERE oz.status = 'active'
      ORDER BY RANDOM()
      LIMIT ?
    `).all(stubbornCount) as Question[];

    // 2. Blind Spots (Not practiced yet)
    const blindQuestions = db.prepare(`
      SELECT q.* FROM questions q
      WHERE NOT EXISTS (
        SELECT 1 FROM practice_logs pl WHERE pl.question_id = q.id
      )
      ORDER BY RANDOM()
      LIMIT ?
    `).all(blindCount) as Question[];

    // 3. Regular Coverage (Random/Mixed)
    const regularQuestions = db.prepare(`
      SELECT q.* FROM questions q
      WHERE q.id NOT IN (${[...stubbornQuestions, ...blindQuestions].map(q => q.id).join(',') || '0'})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(regularCount) as Question[];

    // Shuffle and return
    const session = [...stubbornQuestions, ...blindQuestions, ...regularQuestions];
    return session.sort(() => Math.random() - 0.5);
  }
};
