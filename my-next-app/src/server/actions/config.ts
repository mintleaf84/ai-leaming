'use server';

import logger from '@/lib/logger';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { clearAiConfigCache, getAiConfig, getModel } from '@/lib/ai/client';
import { generateText } from 'ai';
import { getErrorMessage } from '@/lib/utils/error';
import { aiConfigService, type AiConfig, type AiModelRoute } from '@/lib/services/ai-config';

export type { AiConfig, AiModelRoute };

/**
 * 获取所有 AI 配置
 */
export async function getAiConfigsAction(): Promise<AiConfig[]> {
    try {
        await requireRole(['admin']);
        return await aiConfigService.getConfigs();
    } catch (error) {
        logger.error({ err: error }, '[AiConfigAction] 获取列表失败');
        return [];
    }
}

/**
 * 保存配置（新增或更新）
 */
export async function saveAiConfigAction(config: Partial<AiConfig>) {
    const user = await requireRole(['admin']);
    try {
        const id = await aiConfigService.saveConfig(config);

        revalidatePath('/admin');
        clearAiConfigCache();

        // 记录操作日志
        await logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id?.toString() || 'new', { name: config.name });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[AiConfigAction] 保存失败');
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 删除配置
 */
export async function deleteAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    try {
        await aiConfigService.deleteConfig(id);

        // 记录操作日志
        await logAdminAction(user.id, user.username, 'DELETE_AI_CONFIG', 'ai_config', id.toString());

        revalidatePath('/admin');
        clearAiConfigCache();
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || '删除失败' };
    }
}

/**
 * 设置激活配置
 */
export async function setActiveAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    try {
        await aiConfigService.setActiveConfig(id);

        // 记录日志
        await logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id.toString(), { action: 'set_active' });

        revalidatePath('/admin');
        clearAiConfigCache();
        return { success: true };
    } catch (error) {
        return { success: false, error: '切换失败' };
    }
}

/**
 * 获取模型路由配置
 */
export async function getAiModelRoutesAction(): Promise<AiModelRoute[]> {
    try {
        await requireRole(['admin']);
        return await aiConfigService.getRoutes();
    } catch (error) {
        return [];
    }
}

/**
 * 保存模型路由配置
 */
export async function saveAiModelRouteAction(route: AiModelRoute) {
    const user = await requireRole(['admin']);
    try {
        await aiConfigService.saveRoute(route);

        // 记录日志
        await logAdminAction(
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
    } catch (error) {
        return { success: false, error: '保存路由失败' };
    }
}

/**
 * 测试 AI 连接
 */
export async function testAiConnectionAction(apiKey: string, apiUrl: string, modelName: string) {
    const user = await requireRole(['admin']);
    
    try {
        const prompt = "Please respond with 'Pong' to verify the connection.";
        const config = getAiConfig('economy', apiKey, apiUrl);
        const model = getModel(config.apiKey, config.baseURL, modelName || config.modelName);

        const { text } = await generateText({
            model,
            messages: [{ role: 'user', content: prompt }],
            abortSignal: AbortSignal.timeout(20000), 
        });

        // 记录审计日志
        await logAdminAction(user.id, user.username, 'TEST_AI_CONNECTION', 'ai_config', 'test', { 
            url: apiUrl, 
            model: modelName,
            success: true 
        });

        return { 
            success: true, 
            message: text.length > 100 ? text.slice(0, 97) + '...' : text 
        };
    } catch (error: unknown) {
        logger.error({ err: error, user: user.username }, "[AiConfigAction] 测试连接失败");
        
        // 记录失败日志
        await logAdminAction(user.id, user.username, 'TEST_AI_CONNECTION', 'ai_config', 'test', { 
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
