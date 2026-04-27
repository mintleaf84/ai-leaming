import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * AI 缓存服务 - 管理纠偏、挑战、第一性原理等 AI 生成内容的持久化
 */
export const aiCacheService = {
    /**
     * 获取纠偏找茬缓存
     */
    async getQuiz(hash: string) {
        const res = await drizzleDb.select()
            .from(drizzleSchema.ai_quiz_cache)
            .where(eq(drizzleSchema.ai_quiz_cache.hash, hash))
            .get();
        return res ? JSON.parse(res.data) : null;
    },

    /**
     * 保存纠偏找茬缓存
     */
    async setQuiz(hash: string, data: any) {
        await drizzleDb.insert(drizzleSchema.ai_quiz_cache)
            .values({ hash, data: JSON.stringify(data) })
            .onConflictDoUpdate({ target: drizzleSchema.ai_quiz_cache.hash, set: { data: JSON.stringify(data) } });
    },

    /**
     * 获取回归挑战缓存
     */
    async getChallenge(hash: string) {
        const res = await drizzleDb.select()
            .from(drizzleSchema.ai_challenge_cache)
            .where(eq(drizzleSchema.ai_challenge_cache.hash, hash))
            .get();
        return res ? JSON.parse(res.data) : null;
    },

    /**
     * 保存回归挑战缓存
     */
    async setChallenge(hash: string, data: any) {
        await drizzleDb.insert(drizzleSchema.ai_challenge_cache)
            .values({ hash, data: JSON.stringify(data) })
            .onConflictDoUpdate({ target: drizzleSchema.ai_challenge_cache.hash, set: { data: JSON.stringify(data) } });
    },

    /**
     * 获取第一性原理缓存
     */
    async getFirstPrinciples(hash: string) {
        const res = await drizzleDb.select()
            .from(drizzleSchema.first_principles_cache)
            .where(eq(drizzleSchema.first_principles_cache.question_hash, hash))
            .get();
        return res ? res.analysis : null;
    },

    /**
     * 保存第一性原理缓存
     */
    async setFirstPrinciples(hash: string, analysis: string) {
        await drizzleDb.insert(drizzleSchema.first_principles_cache)
            .values({ question_hash: hash, analysis })
            .onConflictDoUpdate({ target: drizzleSchema.first_principles_cache.question_hash, set: { analysis } });
    }
};
