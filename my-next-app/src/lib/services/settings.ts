import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

export interface SystemSettings {
    reviewThreshold: number;
    aiSeverity: 'low' | 'medium' | 'high';
    darkMode: boolean;
}

/**
 * 设置服务 - 处理系统配置与用户数据重置
 */
export const settingsService = {
    /**
     * 获取用户设置
     */
    async getSettings(userId: number): Promise<SystemSettings> {
        const rows = await drizzleDb.select({ key: drizzleSchema.system_settings.key, value: drizzleSchema.system_settings.value })
            .from(drizzleSchema.system_settings)
            .where(eq(drizzleSchema.system_settings.user_id, userId))
            .all();

        const settingsMap = new Map(rows.map(r => [r.key, r.value]));

        return {
            reviewThreshold: parseInt(settingsMap.get('review_threshold') || '60'),
            aiSeverity: (settingsMap.get('ai_severity') as 'low' | 'medium' | 'high' | undefined) ?? 'medium',
            darkMode: settingsMap.get('dark_mode') === 'true',
        };
    },

    /**
     * 更新设置 (Upsert 模式)
     */
    async updateSettings(userId: number, settings: Partial<SystemSettings>) {
        const entries = [];
        if (settings.reviewThreshold !== undefined) entries.push({ key: 'review_threshold', value: settings.reviewThreshold.toString() });
        if (settings.aiSeverity !== undefined) entries.push({ key: 'ai_severity', value: settings.aiSeverity });
        if (settings.darkMode !== undefined) entries.push({ key: 'dark_mode', value: settings.darkMode.toString() });

        if (entries.length === 0) return;

        // Drizzle 还不支持 SQLite 的复合主键 ON CONFLICT 语法那么简洁，这里用循环或 sql 模板
        for (const entry of entries) {
            await drizzleDb.insert(drizzleSchema.system_settings)
                .values({
                    user_id: userId,
                    key: entry.key,
                    value: entry.value,
                    updated_at: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: [drizzleSchema.system_settings.user_id, drizzleSchema.system_settings.key],
                    set: { 
                        value: entry.value,
                        updated_at: sql`CURRENT_TIMESTAMP`
                    }
                });
        }
    },

    /**
     * 重置用户所有学习数据 (慎用)
     */
    async resetUserData(userId: number) {
        return await drizzleDb.transaction(async (tx) => {
            await tx.delete(drizzleSchema.practice_logs).where(eq(drizzleSchema.practice_logs.user_id, userId));
            await tx.delete(drizzleSchema.practice_sessions).where(eq(drizzleSchema.practice_sessions.user_id, userId));
            await tx.delete(drizzleSchema.user_mastery).where(eq(drizzleSchema.user_mastery.user_id, userId));
            await tx.delete(drizzleSchema.observation_zone).where(eq(drizzleSchema.observation_zone.user_id, userId));
            await tx.delete(drizzleSchema.chat_sessions).where(eq(drizzleSchema.chat_sessions.user_id, userId));
            await tx.delete(drizzleSchema.knowledge_cards).where(eq(drizzleSchema.knowledge_cards.user_id, userId));
            
            return true;
        });
    }
};
