'use server';
import logger from '@/lib/logger';

import { requireUser } from '@/lib/auth/auth';
import { questionService } from '@/lib/services/question';

/**
 * 题目摘要（用于笔记引用卡片展示）
 */
export interface QuestionSummary {
    id: number;
    content: string;      // 题目内容（截取前 100 字）
    type: string;         // 题型：single_choice / multiple_choice / true_false
    tags: string[];       // 知识点标签
}

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

        const question = await questionService.getById(questionId);

        if (!question) {
            return { success: false, message: '题目不存在' };
        }

        // 解析 tags（可能是 JSON 字符串或数组）
        let tags: string[] = [];
        if (typeof question.tags === 'string') {
            try {
                tags = JSON.parse(question.tags);
            } catch {
                tags = question.tags ? [question.tags] : [];
            }
        } else if (Array.isArray(question.tags)) {
            tags = question.tags;
        }

        const summary: QuestionSummary = {
            id: question.id,
            content: question.content.slice(0, 100) + (question.content.length > 100 ? '...' : ''),
            type: question.type,
            tags,
        };

        return { success: true, summary };
    } catch (error: unknown) {
        logger.error('[getQuestionSummaryAction] 错误:', error);
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

        // 空查询返回最近的题目
        const result = await questionService.list({
            search: query.trim() || undefined,
            limit,
            offset: 0,
        });

        const questions: QuestionSummary[] = result.items.map((q) => {
            // 解析 tags
            let tags: string[] = [];
            if (typeof q.tags === 'string') {
                try {
                    tags = JSON.parse(q.tags);
                } catch {
                    tags = q.tags ? [q.tags] : [];
                }
            } else if (Array.isArray(q.tags)) {
                tags = q.tags;
            }

            return {
                id: q.id,
                content: q.content.slice(0, 100) + (q.content.length > 100 ? '...' : ''),
                type: q.type,
                tags,
            };
        });

        return { success: true, questions };
    } catch (error: unknown) {
        logger.error('[searchQuestionsAction] 错误:', error);
        return { success: false, message: '搜索题目失败' };
    }
}
