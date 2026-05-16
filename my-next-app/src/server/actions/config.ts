'use server';

import { adminAction } from '@/lib/safe-action';
import { aiConfigService } from '@/lib/services/ai-config';
import { logAdminAction } from '@/lib/admin/audit';
import { clearAiConfigCache, getAiConfig, getModel } from '@/lib/ai/client';
import { generateText } from 'ai';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/utils/error';
import logger from '@/lib/logger';
import { 
  SaveAiConfigSchema, 
  SaveAiModelRouteSchema, 
  TestAiConnectionSchema 
} from '@/lib/validations/config';

/**
 * 获取所有 AI 配置
 */
export const getAiConfigsAction = adminAction
    .action(async () => {
        return await aiConfigService.getConfigs();
    });

/**
 * 保存配置（新增或更新）
 */
export const saveAiConfigAction = adminAction
    .inputSchema(SaveAiConfigSchema.partial())
    .action(async ({ parsedInput: config, ctx }) => {
        const { user } = ctx;
        const id = await aiConfigService.saveConfig(config);

        revalidatePath('/admin');
        clearAiConfigCache();

        after(() => logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id?.toString() || 'new', { name: config.name }));

        return { success: true };
    });

/**
 * 删除配置
 */
export const deleteAiConfigAction = adminAction
    .inputSchema(z.number())
    .action(async ({ parsedInput: id, ctx }) => {
        const { user } = ctx;
        await aiConfigService.deleteConfig(id);

        after(() => logAdminAction(user.id, user.username, 'DELETE_AI_CONFIG', 'ai_config', id.toString()));

        revalidatePath('/admin');
        clearAiConfigCache();
        return { success: true };
    });

/**
 * 设置激活配置
 */
export const setActiveAiConfigAction = adminAction
    .inputSchema(z.number())
    .action(async ({ parsedInput: id, ctx }) => {
        const { user } = ctx;
        await aiConfigService.setActiveConfig(id);

        after(() => logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id.toString(), { action: 'set_active' }));

        revalidatePath('/admin');
        clearAiConfigCache();
        return { success: true };
    });

/**
 * 获取模型路由配置
 */
export const getAiModelRoutesAction = adminAction
    .action(async () => {
        return await aiConfigService.getRoutes();
    });

/**
 * 保存模型路由配置
 */
export const saveAiModelRouteAction = adminAction
    .inputSchema(SaveAiModelRouteSchema)
    .action(async ({ parsedInput: route, ctx }) => {
        const { user } = ctx;
        await aiConfigService.saveRoute(route as any);

        after(() => logAdminAction(
            user.id,
            user.username,
            'UPDATE_AI_ROUTE',
            'ai_model_route',
            route.feature,
            { config_id: route.config_id, model_name: route.model_name }
        ));

        revalidatePath('/admin/ai');
        clearAiConfigCache();
        return { success: true };
    });

/**
 * 测试 AI 连接
 */
export const testAiConnectionAction = adminAction
    .inputSchema(TestAiConnectionSchema)
    .action(async ({ parsedInput: input, ctx }) => {
        const { apiKey, apiUrl, modelName } = input;
        const { user } = ctx;
        
        try {
            const prompt = "Please respond with 'Pong' to verify the connection.";
            const config = await getAiConfig('economy', apiKey, apiUrl);
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
    });
