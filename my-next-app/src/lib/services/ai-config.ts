import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, desc, sql, count } from 'drizzle-orm';

export interface AiConfig {
    id: number;
    name: string;
    api_url: string;
    api_key: string;
    model_economy: string;
    model_premium: string;
    model_embedding?: string;
    embedding_dimensions?: number;
    model_rerank?: string;
    model_knowledge?: string;
    is_active: boolean;
    created_at?: string;
}

export interface AiModelRoute {
    feature: string;
    config_id: number;
    model_name: string;
    updated_at?: string;
}

/**
 * AI 配置服务 - 管理多供应商配置与模型路由
 */
export const aiConfigService = {
    /**
     * 获取所有配置
     */
    async getConfigs(): Promise<AiConfig[]> {
        const rows = await drizzleDb.select()
            .from(drizzleSchema.ai_configs)
            .orderBy(desc(drizzleSchema.ai_configs.created_at));
        
        return rows.map(s => ({
            ...s,
            is_active: Boolean(s.is_active)
        })) as AiConfig[];
    },

    /**
     * 保存配置
     */
    async saveConfig(config: Partial<AiConfig>) {
        if (config.id) {
            // 更新
            const updateData: Record<string, unknown> = { ...config };
            delete updateData.id;
            await drizzleDb.update(drizzleSchema.ai_configs)
                .set(updateData)
                .where(eq(drizzleSchema.ai_configs.id, config.id));
            return config.id;
        } else {
            // 新增 (第一个自动激活)
            const countResult = await drizzleDb.select({ value: count() }).from(drizzleSchema.ai_configs).get();
            const isActive = (countResult?.value || 0) === 0;

            const [result] = await drizzleDb.insert(drizzleSchema.ai_configs).values({
                name: config.name as string,
                api_url: config.api_url as string,
                api_key: config.api_key as string,
                model_economy: config.model_economy || 'gpt-4o-mini',
                model_premium: config.model_premium || 'gpt-4o',
                model_embedding: config.model_embedding || 'text-embedding-3-small',
                embedding_dimensions: config.embedding_dimensions || 768,
                model_knowledge: config.model_knowledge || '',
                model_rerank: config.model_rerank || '',
                is_active: isActive
            }).returning({ id: drizzleSchema.ai_configs.id });
            
            return result.id;
        }
    },

    /**
     * 删除配置
     */
    async deleteConfig(id: number) {
        const config = await drizzleDb.select({ is_active: drizzleSchema.ai_configs.is_active })
            .from(drizzleSchema.ai_configs)
            .where(eq(drizzleSchema.ai_configs.id, id))
            .get();
        
        if (config?.is_active) {
            throw new Error("无法删除当前激活的配置，请先切换到其他配置。");
        }

        await drizzleDb.delete(drizzleSchema.ai_configs)
            .where(eq(drizzleSchema.ai_configs.id, id));
        return true;
    },

    /**
     * 切换激活状态
     */
    async setActiveConfig(id: number) {
        await drizzleDb.transaction(async (tx) => {
            await tx.update(drizzleSchema.ai_configs).set({ is_active: false });
            await tx.update(drizzleSchema.ai_configs).set({ is_active: true }).where(eq(drizzleSchema.ai_configs.id, id));
        });
        return true;
    },

    /**
     * 路由管理
     */
    async getRoutes(): Promise<AiModelRoute[]> {
        return await drizzleDb.select().from(drizzleSchema.ai_model_routes) as AiModelRoute[];
    },

    async saveRoute(route: AiModelRoute) {
        await drizzleDb.insert(drizzleSchema.ai_model_routes).values({
            feature: route.feature,
            config_id: route.config_id,
            model_name: route.model_name
        }).onConflictDoUpdate({
            target: drizzleSchema.ai_model_routes.feature,
            set: {
                config_id: route.config_id,
                model_name: route.model_name,
                updated_at: sql`CURRENT_TIMESTAMP`
            }
        });
        return true;
    }
};
