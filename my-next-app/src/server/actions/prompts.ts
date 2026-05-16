'use server';

import { adminAction } from '@/lib/safe-action';
import { promptService } from '@/lib/services/prompt';
import { logAdminAction } from '@/lib/admin/audit';
import { buildPrompt } from '@/lib/ai/prompts';
import { generateStructuredData, generateTextWrapper, AiRawResponseError } from '@/lib/ai/client';
import { CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';
import { SavePromptSchema, DebugPromptSchema } from '@/lib/validations/prompt';
import { after } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/utils/error';

/**
 * 获取所有 Prompt 模板 (管理员权限)
 */
export const getPromptTemplatesAction = adminAction
    .action(async () => {
        return await promptService.getAllTemplates();
    });

/**
 * 保存或更新 Prompt 模板 (管理员权限)
 */
export const savePromptTemplateAction = adminAction
    .inputSchema(SavePromptSchema)
    .action(async ({ parsedInput: input, ctx }) => {
        const { key, template, description, variables } = input;
        const { user } = ctx;
        await promptService.upsertTemplate(key, template, description, variables);
        
        after(() => logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { description }));

        return { success: true };
    });

/**
 * 重置 Prompt 模板至系统默认 (管理员权限)
 */
export const resetPromptTemplateAction = adminAction
    .inputSchema(z.string())
    .action(async ({ parsedInput: key, ctx }) => {
        const { user } = ctx;
        await promptService.deleteTemplate(key);
        
        after(() => logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { action: 'reset_to_default' }));

        return { success: true };
    });

/**
 * 调试 Prompt 模板
 */
export const debugPromptTemplateAction = adminAction
    .inputSchema(DebugPromptSchema)
    .action(async ({ parsedInput: input }) => {
        const { key, template, inputVariables } = input;
        try {
            // 1. 变量插值
            const interpolatedPrompt = buildPrompt(template, inputVariables);

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
            const rawResponse = error instanceof AiRawResponseError ? error.rawResponse : undefined;
            return {
                success: false,
                error: getErrorMessage(error),
                result: rawResponse ? `[RAW RESPONSE]\n${rawResponse}` : undefined,
            };
        }
    });
