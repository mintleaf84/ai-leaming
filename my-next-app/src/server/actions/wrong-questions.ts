'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { wrongQuestionService, type WrongQuestionItem } from '@/lib/services/wrong-question';
import { practiceService } from '@/lib/services/practice';

export type { WrongQuestionItem };

/**
 * 获取按知识点分组的错题
 */
export type WrongQuestionsByTag = {
    tag: string;
    count: number;
    questions: WrongQuestionItem[];
};

/**
 * 错题详情类型
 */
export type WrongQuestionDetail = NonNullable<Awaited<ReturnType<typeof wrongQuestionService.getDetail>>>;

/**
 * 获取错题列表
 */
export async function getWrongQuestionsAction(): Promise<WrongQuestionItem[]> {
    try {
        const user = await requireUser();
        return await wrongQuestionService.getList(user.id);
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 获取错题列表失败");
        return [];
    }
}

/**
 * 获取按知识点分组的错题
 */
export async function getWrongQuestionsByTagAction(): Promise<WrongQuestionsByTag[]> {
    try {
        const questions = await getWrongQuestionsAction();
        const tagMap = new Map<string, WrongQuestionItem[]>();

        questions.forEach(q => {
            q.tags.forEach(tag => {
                if (!tagMap.has(tag)) tagMap.set(tag, []);
                tagMap.get(tag)!.push(q);
            });
        });

        return Array.from(tagMap.entries())
            .map(([tag, questions]) => ({
                tag,
                count: questions.length,
                questions
            }))
            .sort((a, b) => b.count - a.count);
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 获取分组错题失败");
        return [];
    }
}

/**
 * 获取错题统计
 */
export async function getWrongQuestionsStatsAction() {
    try {
        const user = await requireUser();
        return await wrongQuestionService.getStats(user.id);
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 获取统计失败");
        return { total: 0, recent: 0, frequent: 0 };
    }
}

/**
 * 创建错题专项练习会话
 */
export async function createWrongQuestionsPracticeAction(questionIds: number[]) {
    try {
        const user = await requireUser();
        if (questionIds.length === 0) return { success: false, message: '请选择题目' };

        const sessionId = await practiceService.createReviewSession(user.id, questionIds);
        return { success: true, sessionId };
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 创建练习失败");
        return { success: false, message: '创建练习失败' };
    }
}

/**
 * 获取错题详情
 */
export async function getWrongQuestionDetailAction(questionId: number) {
    try {
        const user = await requireUser();
        return await wrongQuestionService.getDetail(user.id, questionId);
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 获取详情失败");
        return null;
    }
}

/**
 * 标记为已掌握
 */
export async function markAsMasteredAction(questionId: number, note?: string) {
    try {
        const user = await requireUser();
        await wrongQuestionService.markAsMastered(user.id, questionId, note);
        return { success: true };
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 标记失败");
        return { success: false, message: '标记失败' };
    }
}

/**
 * 取消掌握标记
 */
export async function unmarkMasteredAction(questionId: number) {
    try {
        const user = await requireUser();
        await wrongQuestionService.unmarkMastered(user.id, questionId);
        return { success: true };
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 取消标记失败");
        return { success: false, message: '取消标记失败' };
    }
}

/**
 * 智能获取一组推荐错题
 */
export async function getRandomWrongQuestionsAction(options: any = {}) {
    try {
        const user = await requireUser();
        return await wrongQuestionService.getRandomRecommended(user.id, options);
    } catch (error) {
        logger.error({ err: error }, "[WrongQuestionAction] 获取推荐失败");
        return [];
    }
}
