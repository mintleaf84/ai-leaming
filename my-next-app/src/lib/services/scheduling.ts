import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql, notInArray } from 'drizzle-orm';
import { Question } from '@/types';

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapRawToQuestion(q: any): Question {
  return {
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
    tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : (q.tags || []),
    type: q.type || 'single',
    dimension: q.dimension || 'knowledge'
  } as Question;
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
   * Drizzle LibSQL 异步版
   */
  generateSession: async (userId: number, limit: number = 35): Promise<Question[]> => {
    const { stubborn: stubbornTarget, blind: blindTarget } = calculateSessionRatios(limit);

    // 1. 顽固题：用户观察区标签下的题目
    // 使用 sql 模版处理 json_each
    const stubbornRows = await drizzleDb.select({
        id: drizzleSchema.questions.id,
        content: drizzleSchema.questions.content,
        options: drizzleSchema.questions.options,
        answer: drizzleSchema.questions.answer,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags,
        dimension: drizzleSchema.questions.dimension,
        type: drizzleSchema.questions.type,
      })
      .from(drizzleSchema.questions)
      .innerJoin(
        drizzleSchema.observation_zone, 
        sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${drizzleSchema.observation_zone.tag_name})`
      )
      .where(and(
        eq(drizzleSchema.observation_zone.status, 'active'),
        eq(drizzleSchema.observation_zone.user_id, userId)
      ))
      .orderBy(sql`RANDOM()`)
      .limit(stubbornTarget);

    const stubbornQuestions = stubbornRows.map(mapRawToQuestion);
    const usedIds = stubbornQuestions.map(q => q.id);

    // 2. 盲区题：该用户从未练习过的题目
    const blindRows = await drizzleDb.select()
      .from(drizzleSchema.questions)
      .where(and(
        // NOT EXISTS 子查询
        sql`NOT EXISTS (
          SELECT 1 FROM practice_logs 
          WHERE practice_logs.question_id = ${drizzleSchema.questions.id} 
          AND practice_logs.user_id = ${userId}
        )`,
        usedIds.length > 0 ? notInArray(drizzleSchema.questions.id, usedIds) : sql`1=1`
      ))
      .orderBy(sql`RANDOM()`)
      .limit(blindTarget);

    const blindQuestions = blindRows.map(mapRawToQuestion);
    usedIds.push(...blindQuestions.map(q => q.id));

    // 3. 常规题：补齐剩余缺口 (limit - 已选数量)
    const remainingCount = Math.max(0, limit - usedIds.length);
    let regularQuestions: Question[] = [];
    
    if (remainingCount > 0) {
      const regularRows = await drizzleDb.select()
        .from(drizzleSchema.questions)
        .where(usedIds.length > 0 ? notInArray(drizzleSchema.questions.id, usedIds) : sql`1=1`)
        .orderBy(sql`RANDOM()`)
        .limit(remainingCount);
      
      regularQuestions = regularRows.map(mapRawToQuestion);
    }

    // 随机打乱合并后的结果
    const session = [...stubbornQuestions, ...blindQuestions, ...regularQuestions];
    return session.sort(() => Math.random() - 0.5);
  }
};
