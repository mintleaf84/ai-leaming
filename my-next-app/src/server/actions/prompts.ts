'use server';

import db from '@/lib/db';
import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';
import { z } from 'zod';
import { buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT, DEFAULT_KNOWLEDGE_EXTRACT_PROMPT, DEFAULT_CHAT_SYSTEM_PROMPT, PROMPT_VARIABLE_EXAMPLES } from '@/lib/ai/prompts';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';

export interface PromptTemplate {
    key: string;
    template: string;
    description: string;
    variables: string[];
    updated_at: string;
    systemDefault?: string;
    variableExamples?: Record<string, string>; // New field for examples
}

export async function getPromptTemplatesAction(): Promise<PromptTemplate[]> {
    try {
        const rows = db.prepare('SELECT * FROM prompt_templates ORDER BY key').all() as any[];

        // Let's first cast rows to partial objects
        const dbRows = rows.map(row => ({
            ...row,
            variables: JSON.parse(row.variables || '[]')
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

        const combined = [...dbRows];

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
                // Attach system default to existing row too
                const row = combined.find(r => r.key === def.key);
                if (row) {
                    row.systemDefault = def.template;
                    row.variableExamples = PROMPT_VARIABLE_EXAMPLES[def.key] || {};
                }
            }
        }

        return combined as PromptTemplate[];
    } catch (error) {
        console.error('Failed to get prompt templates:', error);
        return [];
    }
}

export async function savePromptTemplateAction(
    key: string,
    template: string,
    description: string,
    variables: string[]
): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        db.prepare(`
      INSERT INTO prompt_templates (key, template, description, variables, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        template = excluded.template,
        description = excluded.description,
        variables = excluded.variables,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, template, description, JSON.stringify(variables));

        // 记录日志
        logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { description });

        return { success: true };
    } catch (error: any) {
        console.error('Failed to save prompt template:', error);
        return { success: false, error: error.message };
    }
}

export async function resetPromptTemplateAction(key: string): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        db.prepare('DELETE FROM prompt_templates WHERE key = ?').run(key);

        // 记录日志
        logAdminAction(user.id, user.username, 'UPDATE_PROMPT', 'prompt', key, { action: 'reset_to_default' });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Debug Action
export async function debugPromptTemplateAction(
    key: string,
    template: string,
    inputVariables: Record<string, string>
): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
        // 1. Interpolate variables
        const interpolatedPrompt = buildPrompt(template, inputVariables);

        console.log(`[DebugPrompt] Running for ${key} with prompt length ${interpolatedPrompt.length}`);

        // 2. Select Schema based on key
        let result;
        if (key === 'correction_quiz') {
            result = await generateStructuredData(CorrectionQuizSchema, interpolatedPrompt, 'premium', { retries: 0 });
        } else if (key === 'regression_challenge') {
            result = await generateStructuredData(RegressionChallengeSchema, interpolatedPrompt, 'premium', { retries: 0 });
        } else {
            // Default to text if unknown key
            const { text } = await generateTextWrapper(interpolatedPrompt, 'premium', undefined, undefined, { retries: 0 });
            result = text;
        }

        return { success: true, result };
    } catch (error: any) {
        console.error('Debug prompt failed:', error);
        return { success: false, error: error.message, result: error.rawResponse ? `[RAW RESPONSE]\n${error.rawResponse}` : undefined };
    }
}

// Helper to get prompt (internal use)
// Helper to get prompt (internal use) -> Moved to @/lib/ai/prompts to avoid Server Action async requirement
// export function getPromptFromDbSync...
