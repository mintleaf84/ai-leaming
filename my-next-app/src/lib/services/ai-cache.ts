import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { safeParseJson } from "@/lib/utils/json";

/**
 * AI 缓存服务 - 管理纠偏、挑战、第一性原理等 AI 生成内容的持久化
 */
export const aiCacheService = {
  /**
   * 获取纠偏找茬缓存
   */
  async getQuiz<T = unknown>(hash: string): Promise<T | null> {
    const res = await drizzleDb
      .select()
      .from(drizzleSchema.ai_quiz_cache)
      .where(eq(drizzleSchema.ai_quiz_cache.hash, hash))
      .get();
    // 缓存里的 JSON 坏掉时按"未命中"处理，而不是让整个请求 500
    return res ? safeParseJson<T | null>(res.data, null) : null;
  },

  /**
   * 保存纠偏找茬缓存
   */
  async setQuiz(hash: string, data: unknown) {
    await drizzleDb
      .insert(drizzleSchema.ai_quiz_cache)
      .values({ hash, data: JSON.stringify(data) })
      .onConflictDoUpdate({
        target: drizzleSchema.ai_quiz_cache.hash,
        set: { data: JSON.stringify(data) },
      });
  },

  /**
   * 获取回归挑战缓存
   */
  async getChallenge<T = unknown>(hash: string): Promise<T | null> {
    const res = await drizzleDb
      .select()
      .from(drizzleSchema.ai_challenge_cache)
      .where(eq(drizzleSchema.ai_challenge_cache.hash, hash))
      .get();
    return res ? safeParseJson<T | null>(res.data, null) : null;
  },

  /**
   * 保存回归挑战缓存
   */
  async setChallenge(hash: string, data: unknown) {
    await drizzleDb
      .insert(drizzleSchema.ai_challenge_cache)
      .values({ hash, data: JSON.stringify(data) })
      .onConflictDoUpdate({
        target: drizzleSchema.ai_challenge_cache.hash,
        set: { data: JSON.stringify(data) },
      });
  },

  /**
   * 获取第一性原理缓存
   */
  async getFirstPrinciples(hash: string) {
    const res = await drizzleDb
      .select()
      .from(drizzleSchema.first_principles_cache)
      .where(eq(drizzleSchema.first_principles_cache.question_hash, hash))
      .get();
    return res ? res.analysis : null;
  },

  /**
   * 保存第一性原理缓存
   */
  async setFirstPrinciples(hash: string, analysis: string) {
    await drizzleDb
      .insert(drizzleSchema.first_principles_cache)
      .values({ question_hash: hash, analysis })
      .onConflictDoUpdate({
        target: drizzleSchema.first_principles_cache.question_hash,
        set: { analysis },
      });
  },
};
