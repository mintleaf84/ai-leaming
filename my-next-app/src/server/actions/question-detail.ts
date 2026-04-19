'use server';
import logger from '@/lib/logger';

import { questionService } from '@/lib/services/question';
import { Question } from '@/types';

/**
 * 获取单个题目的完整信息
 */
export async function getQuestionByIdAction(id: number): Promise<{
    success: boolean;
    question?: Question;
    message?: string;
}> {
    try {
        const question = await questionService.getById(id);

        if (!question) {
            return { success: false, message: '题目不存在' };
        }

        return { success: true, question };
    } catch (error: unknown) {
        logger.error({ err: error }, '[getQuestionByIdAction] 错误');
        return { success: false, message: '获取题目失败' };
    }
}
