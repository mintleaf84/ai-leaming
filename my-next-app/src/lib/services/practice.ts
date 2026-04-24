
import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, gt, sql, inArray } from 'drizzle-orm';
import { Question, Dimension } from '@/types';
import { PracticeSessionRowSchema, QuestionRowSchema } from '@/lib/schemas';
import { z } from 'zod';
import logger from '@/lib/logger';
import { DemoService } from '@/lib/practice/demo';

export interface PracticeSessionConfig {
    mode: 'random' | 'wrong' | 'tag' | 'first-principles' | 'smart' | 'review' | 'focus' | 'exam';
    limit: number;
    types?: string[];
    tags?: string[];
    dimensions?: string[];
    enableReview?: boolean;
    enableTimer?: boolean;
}

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapQuestion(q: unknown): Question {
    const data = q as Record<string, any>;
    try {
        return QuestionRowSchema.parse(data);
    } catch (err) {
        logger.error({ err, questionId: data.id }, 'Question mapping failed in practiceService');
        return {
            ...data,
            options: typeof data.options === 'string' ? JSON.parse(data.options) : (data.options || []),
            tags: typeof data.tags === 'string' ? JSON.parse(data.tags) : (data.tags || []),
            type: data.type || 'single',
            dimension: data.dimension || 'knowledge'
        } as Question;
    }
}

export const practiceService = {
    /**
     * 获取或创建练习会话 (核心入口)
     * 整合了演示模式检测、会话恢复与新会话创建逻辑
     */
    async getOrCreateSession(userId: number, forceNew: boolean = false): Promise<{
        questions: Question[];
        sessionId: string;
        resumed?: boolean;
        completedCount?: number;
    }> {
        // 1. 演示模式拦截
        if (await DemoService.isDemoModeEnabled()) {
            const demoResult = await DemoService.getDemoSession(userId);
            if (demoResult) return { ...demoResult, resumed: false, completedCount: 0 };
        }

        // 2. 尝试恢复最近 24 小时内未完成的会话
        if (!forceNew) {
            const lastSession = await drizzleDb.query.practice_sessions.findFirst({
                where: and(
                    eq(drizzleSchema.practice_sessions.user_id, userId),
                    eq(drizzleSchema.practice_sessions.is_demo, 0),
                    gt(drizzleSchema.practice_sessions.created_at, sql`datetime('now', '-1 day')`)
                ),
                orderBy: [desc(drizzleSchema.practice_sessions.created_at)]
            });

            if (lastSession && lastSession.questions_json) {
                // 查询已完成的题目数
                const logResult = await drizzleDb.select({ count: sql<number>`count(*)` })
                    .from(drizzleSchema.practice_logs)
                    .where(eq(drizzleSchema.practice_logs.session_id, lastSession.id))
                    .get();

                const totalQuestions = lastSession.total_questions || 0;
                const completedCount = logResult?.count || 0;

                if (completedCount < totalQuestions) {
                    try {
                        const questions = JSON.parse(lastSession.questions_json) as Question[];
                        const mappedQuestions = questions.map(q => mapQuestion(q));
                        return {
                            questions: await this.attachSrsData(userId, mappedQuestions),
                            sessionId: lastSession.id,
                            resumed: true,
                            completedCount
                        };
                    } catch (e) {
                        logger.error({ err: e, sessionId: lastSession.id }, 'Failed to parse session questions_json');
                    }
                }
            }
        }

        // 3. 创建新随机会话
        const result = await this.createRandomSession(userId);
        
        // 4. 挂载 SRS 数据
        result.questions = await this.attachSrsData(userId, result.questions);
        return result;
    },

    /**
     * 为题目列表挂载 SRS 记忆状态
     */
    async attachSrsData(userId: number, questions: Question[]): Promise<Question[]> {
        if (questions.length === 0) return [];
        
        const qIds = questions.map(q => q.id);
        const srsRows = await drizzleDb.query.question_srs.findMany({
            where: and(
                eq(drizzleSchema.question_srs.user_id, userId),
                inArray(drizzleSchema.question_srs.question_id, qIds)
            )
        });

        const srsMap = new Map(srsRows.map(row => [row.question_id, row]));

        return questions.map(q => {
            const srs = srsMap.get(q.id);
            if (srs) {
                return {
                    ...q,
                    srs: {
                        stability: srs.stability,
                        difficulty: srs.difficulty,
                        due_date: srs.due_date,
                        state: srs.state,
                        last_review: srs.last_review || undefined
                    }
                };
            }
            return q;
        });
    },

    /**
     * 创建随机练习会话
     */
    async createRandomSession(userId: number, limit: number = 10): Promise<{
        questions: Question[];
        sessionId: string;
    }> {
        const sessionId = Math.random().toString(36).substring(2, 15);
        
        const rawQuestions = await drizzleDb.select()
            .from(drizzleSchema.questions)
            .orderBy(sql`RANDOM()`)
            .limit(limit);

        if (!rawQuestions || rawQuestions.length === 0) {
            return { questions: [], sessionId: "" };
        }

        const questions = rawQuestions.map(q => mapQuestion(q));

        await drizzleDb.insert(drizzleSchema.practice_sessions).values({
            id: sessionId,
            user_id: userId,
            total_questions: questions.length,
            questions_json: JSON.stringify(questions),
            practice_mode: 'random',
            is_demo: 0
        });

        return { questions, sessionId };
    },

    /**
     * 提交答题结果
     */
    async submitAnswer(
        userId: number,
        sessionId: string | null,
        questionId: number,
        userAnswer: string,
        isCorrect: boolean,
        duration: number
    ) {
        // 1. 记录答题日志
        await drizzleDb.insert(drizzleSchema.practice_logs).values({
            session_id: sessionId,
            user_id: userId,
            question_id: questionId,
            user_answer: userAnswer,
            is_correct: isCorrect,
            duration_ms: duration
        });

        // 2. 更新会话统计
        if (sessionId) {
            await drizzleDb.update(drizzleSchema.practice_sessions)
                .set({ 
                    correct_count: sql`${drizzleSchema.practice_sessions.correct_count} + ${isCorrect ? 1 : 0}` 
                })
                .where(and(
                    eq(drizzleSchema.practice_sessions.id, sessionId),
                    eq(drizzleSchema.practice_sessions.user_id, userId)
                ));
        }

        // 3. 异步更新掌握度
        const q = await drizzleDb.query.questions.findFirst({
            where: eq(drizzleSchema.questions.id, questionId),
            columns: { tags: true, dimension: true }
        });

        if (q && q.tags) {
            let tags: string[] = [];
            try {
                tags = JSON.parse(q.tags);
            } catch (_e) {
                tags = [];
            }

            const { masteryService } = await import('@/lib/services/mastery');
            tags.forEach((tag: string) => {
                masteryService.updateMastery(userId, tag, q.dimension as Dimension, isCorrect);
            });
        }

        // 4. 更新 FSRS 状态（错题强化逻辑）
        // 只有当题目已经被记为错题（或者在复习模式下）才更新 FSRS 可能是个选择，
        // 但为了完整追踪记忆，通常建议对所有练习过的题都进行 FSRS 追踪。
        try {
            const { srsService } = await import('@/lib/services/srs');
            // 异步执行，不阻塞主流程
            srsService.updateQuestionSrs(userId, questionId, isCorrect, duration).catch(err => {
                logger.error({ err, questionId, userId }, 'Failed to update SRS state');
            });
        } catch (e) {
            logger.error({ err: e }, 'Failed to import srsService');
        }

        return { success: true };
    },

    /**
     * 提交答题结果并验证 (Server-side validation)
     */
    async submitAnswerWithValidation(
        userId: number,
        sessionId: string | null,
        questionId: number,
        userAnswer: string,
        duration: number
    ) {
        const question = await drizzleDb.query.questions.findFirst({
            where: eq(drizzleSchema.questions.id, questionId),
            columns: { answer: true }
        });

        if (!question) {
            throw new Error(`Question ${questionId} not found`);
        }

        const isCorrect = userAnswer === question.answer;
        await this.submitAnswer(userId, sessionId, questionId, userAnswer, isCorrect, duration);

        return { isCorrect, correctAnswer: question.answer };
    },

    /**
     * 获取可用标签
     */
    async getAvailableTags(): Promise<string[]> {
        const result = await drizzleDb.selectDistinct({
            tag: sql<string>`json_each.value`
        })
        .from(sql`${drizzleSchema.questions} AS q, json_each(q.tags)`)
        .orderBy(sql`json_each.value`)
        .all();
        
        return result.map(r => r.tag);
    },

    /**
     * 以后台 ID 获取完整会话内容
     */
    async getSessionById(userId: number, sessionId: string) {
        const session = await drizzleDb.query.practice_sessions.findFirst({
            where: and(
                eq(drizzleSchema.practice_sessions.id, sessionId),
                eq(drizzleSchema.practice_sessions.user_id, userId)
            )
        });

        if (!session || !session.questions_json) return null;

        let questions = session.questions_json ? JSON.parse(session.questions_json) : [];
        
        // 如果存储的是 ID 列表，则查询完整题目 (向下兼容旧逻辑)
        if (questions.length > 0 && (typeof questions[0] === 'string' || typeof questions[0] === 'number')) {
            const rawQuestions = await drizzleDb.select()
                .from(drizzleSchema.questions)
                .where(sql`${drizzleSchema.questions.id} IN (${sql.join(questions, sql`, `)})`);
            questions = rawQuestions.map(q => mapQuestion(q));
        } else {
            // 如果存储的是完整对象，确保进行 mapQuestion 校验/修复
            questions = questions.map((q: unknown) => mapQuestion(q));
        }

        const logResult = await drizzleDb.select({ count: sql<number>`count(*)` })
            .from(drizzleSchema.practice_logs)
            .where(eq(drizzleSchema.practice_logs.session_id, sessionId))
            .get();

        return {
            questions: await this.attachSrsData(userId, questions),
            sessionId: session.id,
            completedCount: logResult?.count || 0,
            practiceMode: session.practice_mode || undefined
        };
    },

    /**
     * 保存会话回顾信息
     */
    async saveSessionReview(userId: number, sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
        await drizzleDb.insert(drizzleSchema.session_reviews).values({
            session_id: sessionId,
            question_id: questionId,
            review_data: JSON.stringify(reviewData)
        });

        await drizzleDb.update(drizzleSchema.practice_sessions)
            .set({ 
                review_count: sql`${drizzleSchema.practice_sessions.review_count} + 1` 
            })
            .where(and(
                eq(drizzleSchema.practice_sessions.id, sessionId),
                eq(drizzleSchema.practice_sessions.user_id, userId)
            ));
        return { success: true };
    }
};

