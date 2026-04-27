'use server';

import logger from '@/lib/logger';
import { generateStructuredData, generateTextWrapper, AiRawResponseError } from '@/lib/ai/client';
import { CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';
import { buildPrompt } from '@/lib/ai/prompts';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { getErrorMessage } from '@/lib/utils/error';
import { promptService, type PromptTemplate } from '@/lib/services/prompt';

export type { PromptTemplate };

/**
 * 获取所有 Prompt 模板 (管理员权限)
 */
export async function getPromptTemplatesAction(): Promise<PromptTemplate[]> {
    try {
        await requireRole(['admin']);
        return await promptService.getAllTemplates();
    } catch (error) {
        logger.error({ err: error }, '[PromptAction] 获取模板失败');
        return [];
    }
}

/**
 * 保存或更新 Prompt 模板 (管理员权限)
 */
export async function savePromptTemplateAction(
    key: string,
    template: string,
    description: string,
    variables: string[]
): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await promptService.upsertTemplate(key, template, description, variables);
        
        // 记录管理员操作日志
        await logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { description });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[PromptAction] 保存模板失败');
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 重置 Prompt 模板至系统默认 (管理员权限)
 */
export async function resetPromptTemplateAction(key: string): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await promptService.deleteTemplate(key);
        
        // 记录管理员操作日志
        await logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { action: 'reset_to_default' });

        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 调试 Prompt 模板
 */
export async function debugPromptTemplateAction(
    key: string,
    template: string,
    inputVariables: Record<string, string>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
        await requireRole(['admin']);
        
        // 1. 变量插值
        const interpolatedPrompt = buildPrompt(template, inputVariables);

        logger.info(`[DebugPrompt] Running for ${key} with prompt length ${interpolatedPrompt.length}`);

        // 2. 根据 Key 选择对应的 Schema 执行 AI 调试
        let result;
        if (key === 'correction_quiz') {
            result = await generateStructuredData(CorrectionQuizSchema, interpolatedPrompt, 'premium', { retries: 0 });
        } else if (key === 'regression_challenge') {
            result = await generateStructuredData(RegressionChallengeSchema, interpolatedPrompt, 'premium', { retries: 0 });
        } else {
            // 未知 Key 默认按文本处理
            const { text } = await generateTextWrapper(interpolatedPrompt, 'premium', undefined, undefined, { retries: 0 });
            result = text;
        }

        return { success: true, result };
    } catch (error: unknown) {
        logger.error({ err: error }, '[PromptAction] Debug prompt failed');
        const rawResponse = error instanceof AiRawResponseError ? error.rawResponse : undefined;
        return {
            success: false,
            error: getErrorMessage(error),
            result: rawResponse ? `[RAW RESPONSE]\n${rawResponse}` : undefined,
        };
    }
}
