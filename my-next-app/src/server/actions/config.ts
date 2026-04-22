'use server';
import logger from '@/lib/logger';

import { getErrorMessage } from '@/lib/utils/error';
import { db,  drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, desc, sql, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { clearAiConfigCache } from '@/lib/ai/client';

export type AiConfig = {
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
};

// 获取所有配置
export async function getAiConfigsAction(): Promise<AiConfig[]> {
    const settings = await drizzleDb.query.ai_configs.findMany({
        orderBy: [desc(drizzleSchema.ai_configs.created_at)]
    });
    return settings.map((s: any) => ({
        ...s,
        is_active: Boolean(s.is_active)
    })) as AiConfig[];
}

// 保存配置（新增或更新）
export async function saveAiConfigAction(config: Partial<AiConfig>) {
    const user = await requireRole(['admin']);
    try {
        if (config.id) {
            // Update
            await drizzleDb.update(drizzleSchema.ai_configs)
                .set({
                    name: config.name,
                    api_url: config.api_url,
                    api_key: config.api_key,
                    model_economy: config.model_economy || 'gpt-4o-mini',
                    model_premium: config.model_premium || 'gpt-4o',
                    model_embedding: config.model_embedding || 'text-embedding-3-small',
                    embedding_dimensions: config.embedding_dimensions || 768,
                    model_knowledge: config.model_knowledge || '',
                    model_rerank: config.model_rerank || ''
                })
                .where(eq(drizzleSchema.ai_configs.id, config.id));
        } else {
            // Insert
            // First check if it's the first config, if so make it active
            const [countResult] = await drizzleDb.select({ value: count() }).from(drizzleSchema.ai_configs);
            const isActive = countResult.value === 0;

            await drizzleDb.insert(drizzleSchema.ai_configs).values({
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
            });
        }

        revalidatePath('/admin');
        clearAiConfigCache();

        // 记录日志
        logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', config.id?.toString() || 'new', { name: config.name });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'saveAiConfigAction error');
        return { success: false, error: getErrorMessage(error) };
    }
}

// 删除配置
export async function deleteAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    // Check if active
    const config = await drizzleDb.query.ai_configs.findFirst({
        where: eq(drizzleSchema.ai_configs.id, id),
        columns: { is_active: true }
    });
    
    if (config && config.is_active) {
        return { success: false, error: "无法删除当前激活的配置，请先切换到其他配置。" };
    }

    await drizzleDb.delete(drizzleSchema.ai_configs)
        .where(eq(drizzleSchema.ai_configs.id, id));

    // 记录日志
    logAdminAction(user.id, user.username, 'DELETE_AI_CONFIG', 'ai_config', id.toString());

    revalidatePath('/admin');
    clearAiConfigCache();
    return { success: true };
}

// 设置激活配置
export async function setActiveAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    
    await drizzleDb.transaction(async (tx: any) => {
        await tx.update(drizzleSchema.ai_configs).set({ is_active: false });
        await tx.update(drizzleSchema.ai_configs).set({ is_active: true }).where(eq(drizzleSchema.ai_configs.id, id));
    });

    // 记录日志
    logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id.toString(), { action: 'set_active' });

    revalidatePath('/admin');
    clearAiConfigCache();
    return { success: true };
}

export interface AiModelRoute {
    feature: string;
    config_id: number;
    model_name: string;
    updated_at?: string;
}

/**
 * 获取模型路由配置
 */
export async function getAiModelRoutesAction(): Promise<AiModelRoute[]> {
    await requireRole(['admin']);
    return await drizzleDb.query.ai_model_routes.findMany() as AiModelRoute[];
}

/**
 * 保存模型路由配置
 */
export async function saveAiModelRouteAction(route: AiModelRoute) {
    const user = await requireRole(['admin']);

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

    // 记录日志
    logAdminAction(
        user.id,
        user.username,
        'UPDATE_AI_ROUTE',
        'ai_model_route',
        route.feature,
        { config_id: route.config_id, model_name: route.model_name }
    );

    revalidatePath('/admin/ai');
    clearAiConfigCache();
    return { success: true };
}

