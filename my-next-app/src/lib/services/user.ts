import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql, count, ne } from 'drizzle-orm';

export interface UserProfileData {
    username: string;
    role: string;
    created_at: string;
    stats: {
        total_questions: number;
        correct_count: number;
        accuracy: number;
        practice_days: number;
        total_sessions: number;
        total_tags: number;
        mastered_tags: number;
        total_chats: number;
    };
}

/**
 * 用户服务 - 处理用户画像、账号设置等逻辑
 */
export const userService = {
    /**
     * 获取用户完整画像统计
     */
    async getUserProfileFull(userId: number): Promise<UserProfileData | null> {
        // 并发查询各项统计指标
        const [
            practiceStats,
            sessionStats,
            masteryStats,
            chatStats,
            userInfo
        ] = await Promise.all([
            // 练习统计
            drizzleDb.select({
                total_questions: count(),
                correct_count: sql<number>`SUM(CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
                practice_days: sql<number>`COUNT(DISTINCT date(${drizzleSchema.practice_logs.timestamp}))`
            }).from(drizzleSchema.practice_logs).where(eq(drizzleSchema.practice_logs.user_id, userId)).get(),

            // 会话统计
            drizzleDb.select({ total_sessions: count() })
                .from(drizzleSchema.practice_sessions).where(eq(drizzleSchema.practice_sessions.user_id, userId)).get(),

            // 掌握度统计
            drizzleDb.select({
                total_tags: count(),
                mastered_tags: sql<number>`SUM(CASE WHEN ${drizzleSchema.user_mastery.score} >= 80 THEN 1 ELSE 0 END)`
            }).from(drizzleSchema.user_mastery).where(eq(drizzleSchema.user_mastery.user_id, userId)).get(),

            // 聊天统计
            drizzleDb.select({ total_chats: count() })
                .from(drizzleSchema.chat_sessions).where(eq(drizzleSchema.chat_sessions.user_id, userId)).get(),

            // 基础信息
            drizzleDb.select({
                username: drizzleSchema.users.username,
                role: drizzleSchema.users.role,
                created_at: drizzleSchema.users.created_at
            }).from(drizzleSchema.users).where(eq(drizzleSchema.users.id, userId)).get()
        ]);

        if (!userInfo) return null;

        const totalQuestions = practiceStats?.total_questions || 0;
        const correctCount = practiceStats?.correct_count || 0;

        return {
            username: userInfo.username,
            role: userInfo.role || 'student',
            created_at: userInfo.created_at || '',
            stats: {
                total_questions: totalQuestions,
                correct_count: correctCount,
                accuracy: totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0,
                practice_days: practiceStats?.practice_days || 0,
                total_sessions: sessionStats?.total_sessions || 0,
                total_tags: masteryStats?.total_tags || 0,
                mastered_tags: masteryStats?.mastered_tags || 0,
                total_chats: chatStats?.total_chats || 0
            }
        };
    },

    /**
     * 更新用户名
     */
    async updateUsername(userId: number, newUsername: string): Promise<{ success: boolean; error?: string }> {
        // 1. 查重
        const existing = await drizzleDb.select({ id: drizzleSchema.users.id })
            .from(drizzleSchema.users)
            .where(and(eq(drizzleSchema.users.username, newUsername), ne(drizzleSchema.users.id, userId)))
            .get();
        
        if (existing) return { success: false, error: '该用户名已被使用' };

        // 2. 更新
        await drizzleDb.update(drizzleSchema.users)
            .set({ username: newUsername })
            .where(eq(drizzleSchema.users.id, userId));
        
        return { success: true };
    }
};
