'use server';
import logger from '@/lib/logger';

import { getErrorMessage } from '@/lib/utils/error';
import { drizzleDb } from '@/lib/db';
import { ai_configs, ai_model_routes } from '@/lib/db/drizzle-schema';
import { eq, desc, sql, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { clearAiConfigCache, getAiConfig, getModel } from '@/lib/ai/client';
import { generateText } from 'ai';

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

// 获取所有 AI 配置
export async function getAiConfigsAction(): Promise<AiConfig[]> {
    const settings = await drizzleDb.select()
        .from(ai_configs)
        .orderBy(desc(ai_configs.created_at));
    
    return settings.map(s => ({
        ...s,
        is_active: Boolean(s.is_active)
    })) as AiConfig[];
}

// 保存配置（新增或更新）
export async function saveAiConfigAction(config: Partial<AiConfig>) {
    const user = await requireRole(['admin']);
    try {
        if (config.id) {
            // 更新逻辑：仅设置传入的非空字段
            const updateData: any = {};
            if (config.name !== undefined) updateData.name = config.name;
            if (config.api_url !== undefined) updateData.api_url = config.api_url;
            if (config.api_key !== undefined) updateData.api_key = config.api_key;
            if (config.model_economy !== undefined) updateData.model_economy = config.model_economy;
            if (config.model_premium !== undefined) updateData.model_premium = config.model_premium;
            if (config.model_embedding !== undefined) updateData.model_embedding = config.model_embedding;
            if (config.embedding_dimensions !== undefined) updateData.embedding_dimensions = config.embedding_dimensions;
            if (config.model_knowledge !== undefined) updateData.model_knowledge = config.model_knowledge;
            if (config.model_rerank !== undefined) updateData.model_rerank = config.model_rerank;

            if (Object.keys(updateData).length > 0) {
                await drizzleDb.update(ai_configs)
                    .set(updateData)
                    .where(eq(ai_configs.id, config.id));
            }
        } else {
            // 新增逻辑
            // 检查是否为第一个配置，若是则默认激活
            const [countResult] = await drizzleDb.select({ value: count() }).from(ai_configs);
            const isActive = countResult.value === 0;

            await drizzleDb.insert(ai_configs).values({
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

        // 记录操作日志
        logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', config.id?.toString() || 'new', { name: config.name });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[AiConfig] 保存失败');
        return { success: false, error: getErrorMessage(error) };
    }
}

// 删除配置
export async function deleteAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    
    // 检查是否为激活状态
    const [config] = await drizzleDb.select({ is_active: ai_configs.is_active })
        .from(ai_configs)
        .where(eq(ai_configs.id, id))
        .limit(1);
    
    if (config && config.is_active) {
        return { success: false, error: "无法删除当前激活的配置，请先切换到其他配置。" };
    }

    await drizzleDb.delete(ai_configs)
        .where(eq(ai_configs.id, id));

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_AI_CONFIG', 'ai_config', id.toString());

    revalidatePath('/admin');
    clearAiConfigCache();
    return { success: true };
}

// 设置激活配置
export async function setActiveAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    
    await drizzleDb.transaction(async (tx) => {
        await tx.update(ai_configs).set({ is_active: false });
        await tx.update(ai_configs).set({ is_active: true }).where(eq(ai_configs.id, id));
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
    return await drizzleDb.select().from(ai_model_routes) as AiModelRoute[];
}

/**
 * 保存模型路由配置
 */
export async function saveAiModelRouteAction(route: AiModelRoute) {
    const user = await requireRole(['admin']);

    await drizzleDb.insert(ai_model_routes).values({
        feature: route.feature,
        config_id: route.config_id,
        model_name: route.model_name
    }).onConflictDoUpdate({
        target: ai_model_routes.feature,
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

/**
 * 测试 AI 连接 (仅限管理员)
 * 增加权限校验、超时控制与审计日志
 */
export async function testAiConnectionAction(apiKey: string, apiUrl: string, modelName: string) {
    const user = await requireRole(['admin']);
    
    try {
        const prompt = "Please respond with 'Pong' to verify the connection.";
        // 使用 economy 模板作为基础，但传入 override 的 key 和 url
        const config = getAiConfig('economy', apiKey, apiUrl);
        const model = getModel(config.apiKey, config.baseURL, modelName || config.modelName);

        logger.info({ user: user.username, url: apiUrl }, '[Admin] 开始测试 AI 连接');

        const { text } = await generateText({
            model,
            messages: [{ role: 'user', content: prompt }],
            abortSignal: AbortSignal.timeout(20000), // 增加到 20s
        });

        // 记录审计日志
        logAdminAction(user.id, user.username, 'TEST_AI_CONNECTION', 'ai_config', 'test', { 
            url: apiUrl, 
            model: modelName,
            success: true 
        });

        return { 
            success: true, 
            message: text.length > 100 ? text.slice(0, 97) + '...' : text 
        };
    } catch (error: unknown) {
        logger.error({ err: error, user: user.username }, "AI Connection Test Failed");
        
        // 记录失败日志
        logAdminAction(user.id, user.username, 'TEST_AI_CONNECTION', 'ai_config', 'test', { 
            url: apiUrl, 
            success: false,
            error: getErrorMessage(error)
        });

        return { 
            success: false, 
            error: getErrorMessage(error, '连接失败，请检查 API Key 和 URL 是否正确。') 
        };
    }
}

