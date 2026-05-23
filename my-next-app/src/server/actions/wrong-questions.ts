'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';
import {
    wrongQuestionService,
    type WrongQuestionItem,
} from '@/lib/services/wrong-question';
import { practiceService } from '@/lib/services/practice';
import { drizzleDb } from '@/lib/db';
import { questions, practice_logs } from '@/lib/db/drizzle-schema';
import { QuestionSchema } from '@/lib/schemas';
import { RandomWrongQuestionsSchema } from '@/lib/validations/wrong-questions';
import { wrongQuestionRecommend } from '@/lib/services/question-recommend';

/**
 * 获取错题列表 (分页)
 */
export const getWrongQuestionsAction = authenticatedAction
    .inputSchema(z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
    }))
    .action(async ({ parsedInput: input, ctx }) => {
        const { user } = ctx;
        const result = await wrongQuestionService.getList(user.id, input);
        return { success: true, ...result };
    });

/**
 * 获取按知识点分组的错题
 */
export const getWrongQuestionsByTagAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        const { questions } = await wrongQuestionService.getList(user.id, { limit: 10000 });
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
 * 手动录入错题（普通用户）
 */
export const createManualWrongQuestionAction = authenticatedAction
    .inputSchema(QuestionSchema)
    .action(async ({ parsedInput: input, ctx }) => {
        const { user } = ctx;
        const dimension = z.enum(['knowledge', 'understanding', 'application']).parse(input.dimension);
        const [createdQuestion] = await drizzleDb.insert(questions)
            .values({
                content: input.content,
                options: JSON.stringify(input.options),
                answer: input.answer,
                explanation: input.explanation,
                tags: JSON.stringify(input.tags),
                dimension,
                type: input.type,
                source: 'manual_wrong_book',
            })
            .returning({ id: questions.id });

        if (!createdQuestion?.id) {
            throw new Error('手动录题失败');
        }

        await drizzleDb.insert(practice_logs).values({
            user_id: user.id,
            question_id: createdQuestion.id,
            user_answer: null,
            is_correct: false,
        });

        return { success: true, questionId: createdQuestion.id };
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

/**
 * 获取相似推荐题目
 * 基于当前错题的知识点，从题库中推荐相似题目
 */
export const getSimilarQuestionsAction = authenticatedAction
    .inputSchema(z.object({
        questionId: z.number(),
        limit: z.number().default(5)
    }))
    .action(async ({ parsedInput: { questionId, limit }, ctx }) => {
        const { user } = ctx;
        // 获取该错题的知识点
        const detail = await wrongQuestionService.getDetail(user.id, questionId);
        if (!detail) {
            return { success: false, message: '题目不存在' };
        }

        // 基于知识点搜索相似题目（排除当前题目）
        const recommended = await wrongQuestionRecommend.recommendByTags(
            questionId,
            detail.tags,
            limit
        );

        return { success: true, questions: recommended };
    });
