'use server';
import logger from '@/lib/logger';

import { requireUser } from '@/lib/auth/auth';
import { parseFenbiData, validateFenbiJson } from '@/lib/import/fenbi-parser';
import { importService } from '@/lib/services/import-service';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth/auth-edge';

/**
 * 导入结果
 */
export interface ImportResult {
    success: boolean;
    sessionId?: string;
    importedCount: number;
    newQuestionsCount: number;
    skippedQuestionsCount: number;
    message: string;
}

/**
 * 获取当前用户的导入鉴权 Token
 */
export async function getImportTokenAction(): Promise<string | null> {
    const sessionCookie = (await cookies()).get(COOKIE_NAME)?.value;
    return sessionCookie || null;
}

/**
 * 导入粉笔 APP 数据
 */
export async function importFenbiDataAction(
    exerciseJson: string,
    solutionsJson: string,
    statsJson?: string
): Promise<ImportResult> {
    try {
        const user = await requireUser();

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

        // 3. 准备导入上下文
        if (parsed.questions.length === 0) {
            return {
                success: false,
                importedCount: 0,
                newQuestionsCount: 0,
                skippedQuestionsCount: 0,
                message: '解析结果为空，请检查数据格式'
            };
        }

        // 4. 调用 Service 执行导入 (事务化)
        const result = await importService.importFenbiData(user.id, parsed);

        return {
            success: true,
            sessionId: result.sessionId,
            importedCount: result.importedCount,
            newQuestionsCount: result.newQuestionsCount,
            skippedQuestionsCount: parsed.questions.length - result.newQuestionsCount,
            message: `成功导入 ${result.importedCount} 条作答记录，新增/更新 ${result.newQuestionsCount} 道题目`
        };

    } catch (error) {
        logger.error({ err: error }, '粉笔数据导入失败');
        return {
            success: false,
            importedCount: 0,
            newQuestionsCount: 0,
            skippedQuestionsCount: 0,
            message: `导入失败: ${(error as Error).message}`
        };
    }
}

/**
 * 预览导入数据（不实际写入）
 */
export async function previewFenbiDataAction(
    exerciseJson: string,
    solutionsJson: string,
    statsJson?: string
): Promise<{
    valid: boolean;
    error?: string;
    preview?: {
        sessionName: string;
        totalCount: number;
        correctCount: number;
        errorCount: number;
        accuracy: number;
        sampleQuestions: Array<{
            content: string;
            type: string;
            tags: string[];
        }>;
    };
}> {
    try {
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
    } catch (error) {
        return {
            valid: false,
            error: `解析失败: ${(error as Error).message}`
        };
    }
}
