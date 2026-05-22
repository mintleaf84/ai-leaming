import { drizzleDb } from '@/lib/db';
import {
    practice_sessions,
    practice_logs,
    questions,
    question_srs,
    session_reviews
} from '@/lib/db/drizzle-schema';
import { eq, and, desc, gt, sql, inArray } from 'drizzle-orm';
import { Question, Dimension } from '@/types';
import { PracticeMode, PracticeConfig } from '@/types/practice';
import { QuestionRowSchema } from '@/lib/schemas';
import logger from '@/lib/logger';
import { DemoService } from '@/lib/practice/demo';
import { safeParseJson } from '@/lib/utils/json';

export interface PracticeSessionConfig {
    mode: PracticeMode;
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
    const data = q as Record<string, unknown>;
    try {
        return QuestionRowSchema.parse(data);
    } catch (err) {
        logger.error({ err, questionId: data.id }, 'Question mapping failed in practiceService');
        return {
            ...data,
            options: safeParseJson(data.options as string, [] as string[]),
            tags: safeParseJson(data.tags as string, [] as string[]),
            type: data.type || 'single',
            dimension: data.dimension || 'knowledge'
        } as Question;
    }
}

/**
 * 增强型答案比对函数，支持标号(A/B/C)与文本的双向匹配
 * 与前端 use-practice-controller.ts 保持逻辑一致
 */
function checkAnswerCorrectness(
    userAnswer: string,
    correctAnswer: string,
    options: string[],
    questionType?: string
): boolean {
    // 填空题：按中文分号分割；每空支持用 | 配置多个可接受答案
    if (questionType === 'fill_blank') {
        const userBlanks = userAnswer.split('；').map(s => s.trim());
        const correctBlanks = correctAnswer.split('；').map(s => s.trim());
        if (userBlanks.length !== correctBlanks.length) return false;
        return userBlanks.every((ub, i) => {
            const candidates = correctBlanks[i].split('|').map(s => s.trim()).filter(Boolean);
            return candidates.includes(ub);
        });
    }

    // 1. 精确匹配
    if (userAnswer === correctAnswer) return true;

    // 2. 用户提交标号(A/B/C...) → 对比选项文本
    if (userAnswer.length === 1 && userAnswer >= 'A' && userAnswer <= 'Z') {
        const idx = userAnswer.charCodeAt(0) - 65;
        if (options[idx] === correctAnswer) return true;
    }

    // 3. 正确答案标号 → 对比用户提交文本
    if (correctAnswer.length === 1 && correctAnswer >= 'A' && correctAnswer <= 'Z') {
        const idx = correctAnswer.charCodeAt(0) - 65;
        if (options[idx] === userAnswer) return true;
    }

    // 4. 判断题特殊处理：A=正确, B=错误
    if (options.length === 2) {
        if ((userAnswer === 'A' && correctAnswer === '正确') ||
            (userAnswer === 'B' && correctAnswer === '错误') ||
            (userAnswer === '正确' && correctAnswer === 'A') ||
            (userAnswer === '错误' && correctAnswer === 'B')) {
            return true;
        }
    }

    return false;
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
            const [lastSession] = await drizzleDb.select()
                .from(practice_sessions)
                .where(and(
                    eq(practice_sessions.user_id, userId),
                    eq(practice_sessions.is_demo, 0),
                    gt(practice_sessions.created_at, sql`datetime('now', '-1 day')`)
                ))
                .orderBy(desc(practice_sessions.created_at))
                .limit(1);

            if (lastSession && lastSession.questions_json) {
                // 查询已完成的题目数
                const [logResult] = await drizzleDb.select({ count: sql<number>`count(*)` })
                    .from(practice_logs)
                    .where(eq(practice_logs.session_id, lastSession.id));

                const totalQuestions = lastSession.total_questions || 0;
                const completedCount = Number(logResult?.count) || 0;

                if (completedCount < totalQuestions) {
                    try {
                        const questionsData = JSON.parse(lastSession.questions_json) as Question[];
                        const mappedQuestions = questionsData.map(q => mapQuestion(q));
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
    async attachSrsData(userId: number, questionList: Question[]): Promise<Question[]> {
        if (questionList.length === 0) return [];
        
        const qIds = questionList.map(q => q.id);
        const srsRows = await drizzleDb.select()
            .from(question_srs)
            .where(and(
                eq(question_srs.user_id, userId),
                inArray(question_srs.question_id, qIds)
            ));

        const srsMap = new Map(srsRows.map(row => [row.question_id, row]));

        return questionList.map(q => {
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
        const sessionId = crypto.randomUUID().replace(/-/g, '').substring(0, 15);
        
        const rawQuestions = await drizzleDb.select()
            .from(questions)
            .orderBy(sql`RANDOM()`)
            .limit(limit);

        if (!rawQuestions || rawQuestions.length === 0) {
            return { questions: [], sessionId: "" };
        }

        const questionData = rawQuestions.map(q => mapQuestion(q));

        await drizzleDb.insert(practice_sessions).values({
            id: sessionId,
            user_id: userId,
            total_questions: questionData.length,
            questions_json: JSON.stringify(questionData),
            practice_mode: 'random',
            is_demo: 0
        });

        return { questions: questionData, sessionId };
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
        duration: number,
        totalDurationMs?: number
    ) {
        // 1. 记录答题日志
        await drizzleDb.insert(practice_logs).values({
            session_id: sessionId,
            user_id: userId,
            question_id: questionId,
            user_answer: userAnswer,
            is_correct: isCorrect,
            duration_ms: duration
        });

        // 2. 更新会话统计
        if (sessionId) {
            await drizzleDb.update(practice_sessions)
                .set({ 
                    correct_count: sql`${practice_sessions.correct_count} + ${isCorrect ? 1 : 0}`,
                    total_duration_ms: totalDurationMs ?? undefined
                })
                .where(and(
                    eq(practice_sessions.id, sessionId),
                    eq(practice_sessions.user_id, userId)
                ));
        }

        // 3. 异步更新掌握度
        const [q] = await drizzleDb.select({
                tags: questions.tags,
                dimension: questions.dimension
            })
            .from(questions)
            .where(eq(questions.id, questionId))
            .limit(1);

        if (q && q.tags) {
            const tags = safeParseJson<string[]>(q.tags, []);

            const { masteryService } = await import('@/lib/services/mastery');
            await Promise.all(tags.map(async (tag: string) => {
                await masteryService.updateMastery(userId, tag, q.dimension as Dimension, isCorrect);
            }));
        }

        // 4. 更新 FSRS 状态（错题强化逻辑）
        let updatedSrs = undefined;
        try {
            const { srsService } = await import('@/lib/services/srs');
            updatedSrs = await srsService.updateQuestionSrs(userId, questionId, isCorrect, duration);
        } catch (e) {
            logger.error({ err: e }, 'Failed to update SRS state in submitAnswer');
        }

        return { 
            success: true,
            srs: updatedSrs ? {
                stability: updatedSrs.stability,
                difficulty: updatedSrs.difficulty,
                due_date: updatedSrs.due.toISOString(),
                state: updatedSrs.state,
                nextInterval: updatedSrs.scheduled_days
            } : undefined
        };
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
        const [question] = await drizzleDb.select({
            answer: questions.answer,
            options: questions.options,
            type: questions.type
        })
            .from(questions)
            .where(eq(questions.id, questionId))
            .limit(1);

        if (!question) {
            throw new Error(`Question ${questionId} not found`);
        }

        // 解析 options（可能是 JSON 字符串）
        let options: string[] = [];
        try {
            options = typeof question.options === 'string'
                ? JSON.parse(question.options)
                : (question.options || []);
        } catch {
            options = [];
        }

        // 使用增强比对逻辑
        const correctAnswer = question.answer || '';
        const isCorrect = checkAnswerCorrectness(userAnswer, correctAnswer, options, question.type ?? undefined);
        await this.submitAnswer(userId, sessionId, questionId, userAnswer, isCorrect, duration);

        return { isCorrect, correctAnswer };
    },

    /**
     * 获取可用标签
     */
    async getAvailableTags(): Promise<string[]> {
        const { getAllTags } = await import('@/lib/practice/practice-scheduling');
        return await getAllTags();
    },

    /**
     * 以后台 ID 获取完整会话内容
     */
    async getSessionById(userId: number, sessionId: string) {
        const [session] = await drizzleDb.select()
            .from(practice_sessions)
            .where(and(
                eq(practice_sessions.id, sessionId),
                eq(practice_sessions.user_id, userId)
            ))
            .limit(1);

        if (!session || !session.questions_json) return null;

        // 先查询已完成数量（两个分支都需要）
        const [logResult] = await drizzleDb.select({ count: sql<number>`count(*)` })
            .from(practice_logs)
            .where(eq(practice_logs.session_id, sessionId));
        const completedCount = Number(logResult?.count) || 0;

        let questionData: unknown[] = safeParseJson<unknown[]>(session.questions_json, []);

        // 如果存储的是 ID 列表，则查询完整题目 (向下兼容旧逻辑)
        if (questionData.length > 0 && (typeof questionData[0] === 'string' || typeof questionData[0] === 'number')) {
            const idList = questionData.map((id: unknown) => Number(id)).filter(id => !isNaN(id));
            const rawQuestions = await drizzleDb.select()
                .from(questions)
                .where(inArray(questions.id, idList));
            const mappedQuestions: Question[] = rawQuestions.map(q => mapQuestion(q));
            return {
                questions: await this.attachSrsData(userId, mappedQuestions),
                sessionId: session.id,
                completedCount,
                practiceMode: session.practice_mode || undefined
            };
        }

        // 如果存储的是完整对象，确保进行 mapQuestion 校验/修复
        const mappedQuestions: Question[] = questionData.map((q: unknown) => mapQuestion(q));

        return {
            questions: await this.attachSrsData(userId, mappedQuestions),
            sessionId: session.id,
            completedCount,
            practiceMode: session.practice_mode || undefined
        };
    },

    /**
     * 保存会话回顾信息
     */
    async saveSessionReview(userId: number, sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
        await drizzleDb.insert(session_reviews).values({
            session_id: sessionId,
            question_id: questionId,
            review_data: JSON.stringify(reviewData)
        });

        await drizzleDb.update(practice_sessions)
            .set({ 
                review_count: sql`${practice_sessions.review_count} + 1` 
            })
            .where(and(
                eq(practice_sessions.id, sessionId),
                eq(practice_sessions.user_id, userId)
            ));
        return { success: true };
    },

    /**
     * 根据自定义配置创建练习会话
     */
    async createSessionFromConfig(userId: number, config: PracticeSessionConfig): Promise<{
        questions: Question[];
        sessionId: string;
        config: PracticeSessionConfig;
    }> {
        // 1. 模式映射 (兼容旧名称)
        let mode = config.mode;
        if ((mode as string) === 'wrong') mode = 'mistakes';
        if ((mode as string) === 'tag') mode = 'focus';

        // 2. 准备配置对象并调用调度算法
        const practiceConfig: PracticeConfig = {
            ...config,
            mode,
            types: config.types as PracticeConfig['types'],
            dimensions: config.dimensions as PracticeConfig['dimensions']
        };

        const { practiceSchedulingService } = await import('@/lib/practice/practice-scheduling');
        const rawQuestions = await practiceSchedulingService.generateSessionByConfig(practiceConfig, userId);

        if (!rawQuestions || rawQuestions.length === 0) {
            return { questions: [], sessionId: '', config };
        }

        // 2. 生成会话 ID
        const sessionId = crypto.randomUUID().replace(/-/g, '').substring(0, 15);
        
        // 3. 映射并校验题目数据
        const questionData = rawQuestions.map(q => mapQuestion(q));

        // 4. 持久化会话
        await drizzleDb.insert(practice_sessions).values({
            id: sessionId,
            user_id: userId,
            total_questions: questionData.length,
            questions_json: JSON.stringify(questionData),
            practice_mode: mode,
            is_demo: 0
        });

        // 5. 挂载 SRS 数据并返回
        const questionsWithSrs = await this.attachSrsData(userId, questionData);

        return { questions: questionsWithSrs, sessionId, config };
    },

    /**
     * 创建专项复习会话 (基于给定的题目 ID 列表)
     */
    async createReviewSession(userId: number, questionIds: number[]) {
        const sessionId = `review-${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`;
        
        await drizzleDb.insert(practice_sessions).values({
            id: sessionId,
            user_id: userId,
            total_questions: questionIds.length,
            questions_json: JSON.stringify(questionIds), // 存储 ID 列表，getSessionById 会自动解析
            practice_mode: 'review',
            is_demo: 0
        });

        return sessionId;
    }
};
