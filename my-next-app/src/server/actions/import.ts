'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { parseFenbiData, validateFenbiJson } from '@/lib/import/fenbi-parser';
import { importService } from '@/lib/services/import-service';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth/auth-edge';
import { z } from 'zod';
import type { ImportResult } from '@/types/import';

/**
 * 获取当前用户的导入鉴权 Token
 */
export const getImportTokenAction = authenticatedAction
    .action(async () => {
        const sessionCookie = (await cookies()).get(COOKIE_NAME)?.value;
        return sessionCookie || null;
    });

/**
 * 导入粉笔 APP 数据
 */
export const importFenbiDataAction = authenticatedAction
    .inputSchema(z.object({
        exerciseJson: z.string(),
        solutionsJson: z.string(),
        statsJson: z.string().optional(),
    }))
    .action(async ({ parsedInput: input, ctx }): Promise<ImportResult> => {
        const { exerciseJson, solutionsJson, statsJson } = input;
        const { user } = ctx;

        // 1. 验证 JSON 格式
        const validation = validateFenbiJson(exerciseJson, solutionsJson);
        if (!validation.valid) {
            return {
                success: false,
                importedCount: 0,
                newQuestionsCount: 0,
                skippedQuestionsCount: 0,
                message: validation.error || 'JSON 格式无效'
            };
        }

        // 2. 解析数据
        const parsed = parseFenbiData(exerciseJson, solutionsJson, statsJson);

        if (parsed.questions.length === 0) {
            return {
                success: false,
                importedCount: 0,
                newQuestionsCount: 0,
                skippedQuestionsCount: 0,
                message: '解析结果为空，请检查数据格式'
            };
        }

        // 3. 调用 Service 执行导入 (事务化)
        const result = await importService.importFenbiData(user.id, parsed);

        return {
            success: true,
            sessionId: result.sessionId,
            importedCount: result.importedCount,
            newQuestionsCount: result.newQuestionsCount,
            skippedQuestionsCount: parsed.questions.length - result.newQuestionsCount,
            message: `成功导入 ${result.importedCount} 条作答记录，新增/更新 ${result.newQuestionsCount} 道题目`
        };
    });

/**
 * 预览导入数据（不实际写入）
 */
export const previewFenbiDataAction = authenticatedAction
    .inputSchema(z.object({
        exerciseJson: z.string(),
        solutionsJson: z.string(),
        statsJson: z.string().optional(),
    }))
    .action(async ({ parsedInput: input }) => {
        const { exerciseJson, solutionsJson, statsJson } = input;
        
        // 验证格式
        const validation = validateFenbiJson(exerciseJson, solutionsJson);
        if (!validation.valid) {
            return { valid: false, error: validation.error };
        }

        // 解析数据
        const parsed = parseFenbiData(exerciseJson, solutionsJson, statsJson);

        return {
            valid: true,
            preview: {
                sessionName: parsed.sessionName,
                totalCount: parsed.totalCount,
                correctCount: parsed.correctCount,
                errorCount: parsed.errorCount,
                accuracy: parsed.totalCount > 0
                    ? Math.round((parsed.correctCount / parsed.totalCount) * 100)
                    : 0,
                sampleQuestions: parsed.questions.slice(0, 3).map(q => ({
                    content: q.content.length > 80 ? q.content.substring(0, 80) + '...' : q.content,
                    type: q.type === 'single' ? '单选' : q.type === 'multi' ? '多选' : '判断',
                    tags: q.tags
                }))
            }
        };
    });
