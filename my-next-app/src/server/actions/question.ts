'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { questionService, type QuestionSummary } from '@/lib/services/question';


/**
 * 获取单个题目的摘要信息
 * 用于笔记中渲染引用卡片
 */
export async function getQuestionSummaryAction(questionId: number): Promise<{
    success: boolean;
    summary?: QuestionSummary;
    message?: string;
}> {
    try {
        await requireUser();
        const summary = await questionService.getSummary(questionId);

        if (!summary) {
            return { success: false, message: '题目不存在' };
        }

        return { success: true, summary };
    } catch (error: unknown) {
        logger.error({ err: error }, '[QuestionAction] 获取摘要失败');
        return { success: false, message: '获取题目摘要失败' };
    }
}

/**
 * 搜索题目（用于笔记引用选择器）
 */
export async function searchQuestionsAction(query: string, limit: number = 10): Promise<{
    success: boolean;
    questions?: QuestionSummary[];
    message?: string;
}> {
    try {
        await requireUser();

        const result = await questionService.list({
            search: query.trim() || undefined,
            limit,
            offset: 0,
        });

        // 这里的映射逻辑未来也可以考虑下沉到 Service，目前保持简单
        const questions: QuestionSummary[] = result.items.map((q) => ({
            id: q.id,
            content: q.content.slice(0, 100) + (q.content.length > 100 ? '...' : ''),
            type: q.type,
            tags: q.tags,
        }));

        return { success: true, questions };
    } catch (error: unknown) {
        logger.error({ err: error }, '[QuestionAction] 搜索失败');
        return { success: false, message: '搜索题目失败' };
    }
}
