'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';
import { 
    wrongQuestionService, 
    type WrongQuestionItem, 
    type WrongQuestionsByTag,
    type WrongQuestionDetail 
} from '@/lib/services/wrong-question';
import { practiceService } from '@/lib/services/practice';
import { RandomWrongQuestionsSchema, MarkMasteredSchema } from '@/lib/validations/wrong-questions';

/**
 * 获取错题列表
 */
export const getWrongQuestionsAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        const data = await wrongQuestionService.getList(user.id);
        return { success: true, questions: data };
    });

/**
 * 获取按知识点分组的错题
 */
export const getWrongQuestionsByTagAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        const questions = await wrongQuestionService.getList(user.id);
        const tagMap = new Map<string, WrongQuestionItem[]>();

        questions.forEach(q => {
            q.tags.forEach(tag => {
                if (!tagMap.has(tag)) tagMap.set(tag, []);
                tagMap.get(tag)!.push(q);
            });
        });

        const data = Array.from(tagMap.entries())
            .map(([tag, questions]) => ({
                tag,
                count: questions.length,
                questions
            }))
            .sort((a, b) => b.count - a.count);
        return { success: true, find: data };
    });

/**
 * 获取错题统计
 */
export const getWrongQuestionsStatsAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        const data = await wrongQuestionService.getStats(user.id);
        return { success: true, ...data };
    });

/**
 * 创建错题专项练习会话
 */
export const createWrongQuestionsPracticeAction = authenticatedAction
    .inputSchema(z.array(z.number()))
    .action(async ({ parsedInput: questionIds, ctx }) => {
        const { user } = ctx;
        if (questionIds.length === 0) return { success: false, message: '请选择题目' };

        const sessionId = await practiceService.createReviewSession(user.id, questionIds);
        return { success: true, sessionId };
    });

/**
 * 获取错题详情
 */
export const getWrongQuestionDetailAction = authenticatedAction
    .inputSchema(z.number())
    .action(async ({ parsedInput: questionId, ctx }) => {
        const { user } = ctx;
        const data = await wrongQuestionService.getDetail(user.id, questionId);
        return { success: true, question: data };
    });

/**
 * 标记为已掌握
 */
export const markAsMasteredAction = authenticatedAction
    .inputSchema(z.number()) // 兼容单数字输入
    .action(async ({ parsedInput: questionId, ctx }) => {
        const { user } = ctx;
        await wrongQuestionService.markAsMastered(user.id, questionId);
        return { success: true, message: '已标记为掌握' };
    });

/**
 * 取消掌握标记
 */
export const unmarkMasteredAction = authenticatedAction
    .inputSchema(z.number())
    .action(async ({ parsedInput: questionId, ctx }) => {
        const { user } = ctx;
        await wrongQuestionService.unmarkMastered(user.id, questionId);
        return { success: true, message: '已取消掌握标记' };
    });

/**
 * 智能获取一组推荐错题
 */
export const getRandomWrongQuestionsAction = authenticatedAction
    .inputSchema(RandomWrongQuestionsSchema)
    .action(async ({ parsedInput: options, ctx }) => {
        const { user } = ctx;
        const data = await wrongQuestionService.getRandomRecommended(user.id, options);
        return { success: true, questions: data };
    });

/**
 * 获取已掌握题目列表
 */
export const getMasteredQuestionsAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        const data = await wrongQuestionService.getMasteredQuestions(user.id);
        return { success: true, questions: data };
    });
