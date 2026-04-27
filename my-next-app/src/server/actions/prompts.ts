'use server';
import logger from '@/lib/logger';

import { drizzleDb } from '@/lib/db';
import { prompt_templates } from '@/lib/db/drizzle-schema';
import { eq, asc, sql } from 'drizzle-orm';
import { generateStructuredData, generateTextWrapper, AiRawResponseError } from '@/lib/ai/client';
import { CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';
import { buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT, DEFAULT_KNOWLEDGE_EXTRACT_PROMPT, DEFAULT_CHAT_SYSTEM_PROMPT, PROMPT_VARIABLE_EXAMPLES } from '@/lib/ai/prompts';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { getErrorMessage } from '@/lib/utils/error';
import type { InferSelectModel } from 'drizzle-orm';

export type PromptTemplate = InferSelectModel<typeof prompt_templates> & {
    variables: string[]; // 覆盖为解析后的数组
    systemDefault?: string;
    variableExamples?: Record<string, string>;
};

/**
 * 获取所有 Prompt 模板（包含数据库覆盖和系统默认）
 */
export async function getPromptTemplatesAction(): Promise<PromptTemplate[]> {
    try {
        const rows = await drizzleDb.select()
            .from(prompt_templates)
            .orderBy(asc(prompt_templates.key));

        const dbRows = rows.map(row => ({
            ...row,
            variables: JSON.parse(row.variables || '[]') as string[]
        }));

        const existingKeys = new Set(dbRows.map(r => r.key));
        const defaults = [
            {
                key: 'correction_quiz',
                template: DEFAULT_CORRECTION_PROMPT,
                description: '纠偏找茬 (Correction Quiz)',
                variables: ['questionContent', 'wrongAnswer', 'correctAnswer']
            },
            {
                key: 'regression_challenge',
                template: DEFAULT_REGRESSION_PROMPT,
                description: '回归挑战 (Regression Challenge)',
                variables: ['questionContent', 'tags']
            },
            {
                key: 'knowledge_extract',
                template: DEFAULT_KNOWLEDGE_EXTRACT_PROMPT,
                description: '知识卡片提取 (Knowledge Card Extraction)',
                variables: ['content']
            },
            {
                key: 'chat_system',
                template: DEFAULT_CHAT_SYSTEM_PROMPT,
                description: 'AI 聊天辅助 (Chat System)',
                variables: []
            }
        ];

        const combined: any[] = [...dbRows];

        for (const def of defaults) {
            if (!existingKeys.has(def.key)) {
                combined.push({
                    key: def.key,
                    template: '',
                    description: def.description,
                    variables: def.variables,
                    updated_at: new Date().toISOString(),
                    systemDefault: def.template,
                    variableExamples: PROMPT_VARIABLE_EXAMPLES[def.key] || {}
                });
            } else {
                const row = combined.find(r => r.key === def.key);
                if (row) {
                    row.systemDefault = def.template;
                    row.variableExamples = PROMPT_VARIABLE_EXAMPLES[def.key] || {};
                }
            }
        }

        return combined as PromptTemplate[];
    } catch (error) {
        logger.error({ err: error }, 'Failed to get prompt templates');
        return [];
    }
}

/**
 * 保存或更新 Prompt 模板
 */
export async function savePromptTemplateAction(
    key: string,
    template: string,
    description: string,
    variables: string[]
): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await drizzleDb.insert(prompt_templates).values({
            key,
            template,
            description,
            variables: JSON.stringify(variables),
        }).onConflictDoUpdate({
            target: prompt_templates.key,
            set: {
                template: sql`excluded.template`,
                description: sql`excluded.description`,
                variables: sql`excluded.variables`,
                updated_at: sql`CURRENT_TIMESTAMP`,
            }
        });

        // 记录管理员操作日志
        logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { description });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Failed to save prompt template');
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 重置 Prompt 模板至系统默认（从数据库删除覆盖记录）
 */
export async function resetPromptTemplateAction(key: string): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await drizzleDb.delete(prompt_templates).where(eq(prompt_templates.key, key));

        // 记录管理员操作日志
        logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { action: 'reset_to_default' });

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
        // 1. 变量插值
        const interpolatedPrompt = buildPrompt(template, inputVariables);

        logger.info(`[DebugPrompt] Running for ${key} with prompt length ${interpolatedPrompt.length}`);

        // 2. 根据 Key 选择对应的 Schema
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
        logger.error({ err: error }, 'Debug prompt failed');
        const rawResponse = error instanceof AiRawResponseError ? error.rawResponse : undefined;
        return {
            success: false,
            error: getErrorMessage(error),
            result: rawResponse ? `[RAW RESPONSE]\n${rawResponse}` : undefined,
        };
    }
}
