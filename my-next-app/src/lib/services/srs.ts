import { FSRS, Rating, createEmptyCard, Card, State, fsrs, generatorParameters } from 'ts-fsrs';
import { db, drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql, lte, desc } from 'drizzle-orm';

// FSRS 基础配置
const f = fsrs(generatorParameters());

// 认知参数配置
const READING_SPEED_CHARS_PER_SEC = 7; // 平均阅读速度：7字/秒
const THINKING_TIME_THRESHOLDS = {
    EASY: 2,   // 纯思考时间 < 2s 为简单
    GOOD: 8,   // 2s <= 纯思考时间 <= 8s 为正常
    // > 8s 为困难
};

export interface SRSCardState extends Card {
    question_id: number;
    due_date: Date;
}

export const srsService = {
    /**
     * 根据答题耗时和题目长度计算 FSRS 评分 (Rating)
     */
    calculateRating: (questionContent: string, optionsJson: string, durationMs: number, questionType?: string): Rating => {
        // 1. 计算总字数（题干 + 选项）
        let optionsText = '';
        try {
            const options = JSON.parse(optionsJson);
            if (Array.isArray(options)) {
                optionsText = options.join('');
            }
        } catch (e) {
            optionsText = optionsJson || '';
        }
        
        const totalChars = questionContent.length + optionsText.length;
        
        // 2. 估算阅读时间 (秒)
        const readingTimeSec = totalChars / READING_SPEED_CHARS_PER_SEC;
        
        // 3. 计算纯思考时间 (秒)
        const totalDurationSec = durationMs / 1000;
        let thinkingTimeSec = Math.max(0, totalDurationSec - readingTimeSec);

        // 4. 题型系数修正
        // 多选题决策成本高，给予 0.6x 宽容度；判断题决策极快，给予 2.0x 灵敏度
        if (questionType === 'multi') {
            thinkingTimeSec *= 0.6;
        } else if (questionType === 'truefalse') {
            thinkingTimeSec *= 2.0;
        }
        
        // 5. 映射到 FSRS Rating
        if (thinkingTimeSec < THINKING_TIME_THRESHOLDS.EASY) {
            return Rating.Easy; // 4
        } else if (thinkingTimeSec <= THINKING_TIME_THRESHOLDS.GOOD) {
            return Rating.Good; // 3
        } else {
            return Rating.Hard; // 2
        }
    },

    /**
     * 获取或初始化题目的 SRS 状态
     */
    getOrCreateSrsCard: async (userId: number, questionId: number): Promise<Card> => {
        const row = await drizzleDb.query.question_srs.findFirst({
            where: and(
                eq(drizzleSchema.question_srs.user_id, userId),
                eq(drizzleSchema.question_srs.question_id, questionId)
            )
        });

        if (row) {
            const card = createEmptyCard();
            card.due = new Date(row.due_date);
            card.stability = row.stability;
            card.difficulty = row.difficulty;
            card.elapsed_days = row.elapsed_days;
            card.scheduled_days = row.scheduled_days;
            card.reps = row.reps;
            card.lapses = row.lapses;
            card.state = row.state as State;
            card.last_review = row.last_review ? new Date(row.last_review) : undefined;
            return card;
        }

        // 初始化新卡片
        const emptyCard = createEmptyCard();
        
        // 尝试利用“全站正确率”初始化难度
        const question = await drizzleDb.query.questions.findFirst({
            where: eq(drizzleSchema.questions.id, questionId),
            columns: { correct_ratio: true }
        });

        if (question?.correct_ratio !== null && question?.correct_ratio !== undefined) {
            // 归一化正确率：如果是百分比 (0-100) 则转换为 0-1
            let ratio = question.correct_ratio;
            if (ratio > 1) ratio = ratio / 100;
            
            // 简单线性映射：正确率 100% -> 难度 1.0; 正确率 0% -> 难度 10.0
            const initialDifficulty = 10 - (ratio * 9);
            emptyCard.difficulty = Math.max(1, Math.min(10, initialDifficulty));
        }

        return emptyCard;
    },

    /**
     * 更新题目 SRS 状态
     */
    updateQuestionSrs: async (userId: number, questionId: number, isCorrect: boolean, durationMs: number, reviewDate?: Date) => {
        // 1. 获取题目内容用于计算评分
        const question = await drizzleDb.query.questions.findFirst({
            where: eq(drizzleSchema.questions.id, questionId)
        });
        if (!question) return;

        // 2. 获取当前 SRS 状态
        const card = await srsService.getOrCreateSrsCard(userId, questionId);

        // 3. 确定评分
        let rating: Rating;
        if (!isCorrect) {
            rating = Rating.Again; // 1
        } else {
            rating = srsService.calculateRating(question.content, question.options || '[]', durationMs, question.type || undefined);
        }

        // 4. 调用 FSRS 计算新状态
        const now = reviewDate || new Date();
        const schedulingCards = f.repeat(card, now);
        const item = (schedulingCards as any)[rating].card;

        // 5. 保存回数据库
        await drizzleDb.insert(drizzleSchema.question_srs).values({
            user_id: userId,
            question_id: questionId,
            stability: item.stability,
            difficulty: item.difficulty,
            elapsed_days: item.elapsed_days,
            scheduled_days: item.scheduled_days,
            reps: item.reps,
            lapses: item.lapses,
            state: item.state,
            last_review: item.last_review?.toISOString(),
            due_date: item.due.toISOString(),
        }).onConflictDoUpdate({
            target: [drizzleSchema.question_srs.user_id, drizzleSchema.question_srs.question_id],
            set: {
                stability: item.stability,
                difficulty: item.difficulty,
                elapsed_days: item.elapsed_days,
                scheduled_days: item.scheduled_days,
                reps: item.reps,
                lapses: item.lapses,
                state: item.state,
                last_review: item.last_review?.toISOString(),
                due_date: item.due.toISOString(),
            }
        });

        return item;
    },

    /**
     * 获取当前到期的错题数量
     */
    getDueCount: async (userId: number): Promise<number> => {
        const result = await drizzleDb.select({ count: sql<number>`count(*)` })
            .from(drizzleSchema.question_srs)
            .where(and(
                eq(drizzleSchema.question_srs.user_id, userId),
                lte(drizzleSchema.question_srs.due_date, new Date().toISOString())
            ))
            .get();
        return result?.count || 0;
    },

    /**
     * 从练习日志中同步数据到 SRS (用于导入数据后的冷启动)
     */
    syncFromPracticeLogs: async (userId: number) => {
        // 1. 查找所有有练习记录但没有 SRS 记录的题目
        const logs = await drizzleDb.select({
            questionId: drizzleSchema.practice_logs.question_id,
            isCorrect: drizzleSchema.practice_logs.is_correct,
            durationMs: drizzleSchema.practice_logs.duration_ms,
            timestamp: drizzleSchema.practice_logs.timestamp
        })
        .from(drizzleSchema.practice_logs)
        .leftJoin(
            drizzleSchema.question_srs, 
            and(
                eq(drizzleSchema.question_srs.question_id, drizzleSchema.practice_logs.question_id),
                eq(drizzleSchema.question_srs.user_id, userId)
            )
        )
        .where(and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            sql`${drizzleSchema.question_srs.question_id} IS NULL`
        ))
        .orderBy(drizzleSchema.practice_logs.timestamp);

        if (logs.length === 0) return 0;

        // 2. 按题目分组并按时间顺序重播
        const questionGroups = new Map<number, any[]>();
        for (const log of logs) {
            if (!questionGroups.has(log.questionId)) {
                questionGroups.set(log.questionId, []);
            }
            questionGroups.get(log.questionId)!.push(log);
        }

        let syncCount = 0;
        for (const [qId, qLogs] of questionGroups.entries()) {
            // 对每个题目，按时间顺序模拟它的记忆曲线
            for (const log of qLogs) {
                const reviewDate = log.timestamp ? new Date(log.timestamp) : undefined;
                await srsService.updateQuestionSrs(userId, qId, log.isCorrect, log.durationMs || 0, reviewDate);
            }
            syncCount++;
        }
        
        console.log(`[SRS] 同步完成: 为 ${syncCount} 道题目初始化了 SRS 状态`);
        return syncCount;
    }
};
