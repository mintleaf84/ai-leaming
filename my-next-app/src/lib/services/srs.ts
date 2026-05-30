import { Rating, createEmptyCard, Card, State, fsrs, generatorParameters, type RecordLogItem } from 'ts-fsrs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
import { drizzleDb } from '@/lib/db';
import { questions, question_srs, practice_logs, system_settings } from '@/lib/db/drizzle-schema';
import { eq, and, sql, lte, isNull, count, gte } from 'drizzle-orm';

// 批量同步配置
const SYNC_BATCH_SIZE = 100;

/**
 * 内部辅助：确保 DB 存储的 state 值映射到正确的 State 枚举
 */
function mapDbStateToEnum(dbState: unknown): State {
    if (typeof dbState === 'number' && dbState >= 0 && dbState <= 3) {
        return dbState as State;
    }
    return State.New;
}

// FSRS 基础配置
const f = fsrs(generatorParameters());

// 认知参数配置
const DEFAULT_READING_SPEED = 7; // 默认阅读速度：7字/秒
const READING_SPEED_ALPHA = 0.1; // EMA 平滑系数
const SPEED_LIMITS = { MIN: 3, MAX: 20 }; // 速度约束区间
const THINKING_TIME_THRESHOLDS = {
    EASY: 2,   // 纯思考时间 < 2s 为简单
    GOOD: 8,   // 2s <= 纯思考时间 <= 8s 为正常
};
const FILL_BLANK_THRESHOLDS = {
    EASY: 4,   // 填空题纯思考时间 < 4s 为简单
    GOOD: 12,  // 4s <= 填空题纯思考时间 <= 12s 为正常
};
const FILL_BLANK_TYPING_SPEED = 5; // 填空题默认打字速度（字符/秒），统一在此调参
const FILL_BLANK_THINKING_TIME_DISCOUNT = 0.6; // 填空题思考时间折扣，统一在此调参

/**
 * 内部辅助：获取用户当前的基准阅读速度
 */
async function getReadingSpeed(userId: number, questionType?: string): Promise<number> {
    const key = questionType === 'multi' ? 'reading_speed_multi' : 
                questionType === 'truefalse' ? 'reading_speed_truefalse' : 
                questionType === 'fill_blank' ? 'reading_speed_fill_blank' :
                'reading_speed_base';

    const [setting] = await drizzleDb.select()
        .from(system_settings)
        .where(and(
            eq(system_settings.user_id, userId),
            eq(system_settings.key, key)
        ))
        .limit(1);

    if (!setting && key !== 'reading_speed_base') {
        const [baseSetting] = await drizzleDb.select()
            .from(system_settings)
            .where(and(
                eq(system_settings.user_id, userId),
                eq(system_settings.key, 'reading_speed_base')
            ))
            .limit(1);
        return baseSetting?.value ? parseFloat(baseSetting.value) : DEFAULT_READING_SPEED;
    }

    return setting?.value ? parseFloat(setting.value) : DEFAULT_READING_SPEED;
}

/**
 * 内部辅助：根据本次表现更新基准速度 (EMA 算法)
 */
export async function learnReadingSpeed(userId: number, questionContent: string, optionsJson: string, durationMs: number, questionType?: string, userAnswerLength?: number) {
    let optionsText = '';
    try {
        const options = JSON.parse(optionsJson);
        if (Array.isArray(options)) optionsText = options.join('');
    } catch (_e) {
        optionsText = optionsJson || '';
    }

    // 填空题需要加上用户答案长度
    const answerLength = (questionType === 'fill_blank' && userAnswerLength) ? userAnswerLength : 0;
    const totalChars = questionContent.length + optionsText.length + answerLength;

    if (totalChars < 10 || durationMs < 1000 || durationMs > 60000) return;

    const currentSpeed = totalChars / (durationMs / 1000);
    const oldSpeed = await getReadingSpeed(userId, questionType);
    
    let newSpeed = oldSpeed * (1 - READING_SPEED_ALPHA) + currentSpeed * READING_SPEED_ALPHA;
    newSpeed = Math.max(SPEED_LIMITS.MIN, Math.min(SPEED_LIMITS.MAX, newSpeed));

    const key = questionType === 'multi' ? 'reading_speed_multi' : 
                questionType === 'truefalse' ? 'reading_speed_truefalse' : 
                questionType === 'fill_blank' ? 'reading_speed_fill_blank' :
                'reading_speed_base';

    await drizzleDb.insert(system_settings).values({
        user_id: userId,
        key: key,
        value: newSpeed.toFixed(2),
    }).onConflictDoUpdate({
        target: [system_settings.user_id, system_settings.key],
        set: { value: newSpeed.toFixed(2), updated_at: sql`CURRENT_TIMESTAMP` }
    });
}

export interface SRSCardState extends Card {
    question_id: number;
    due_date: Date;
}

// 统计数据类型定义
export interface SrsGlobalStats {
  totalCards: number;
  stateDistribution: {
    new: number;
    learning: number;
    review: number;
    relearning: number;
  };
  stabilityDistribution: { range: string; count: number; }[];
  difficultyDistribution: { range: string; count: number; }[];
  futureReviews: { date: string; count: number; estimatedMinutes: number; }[];
  retentionStats: { trueRetention: number; totalReviews: number; };
  readingSpeed: { base: number; multi: number; truefalse: number; };
  learnedCount: number;
}

export function summarizeFutureReviews(futureReviews: SrsGlobalStats['futureReviews']) {
        return futureReviews.reduce(
                (summary, day) => ({
                        totalCount: summary.totalCount + day.count,
                        totalMinutes: summary.totalMinutes + day.estimatedMinutes,
                }),
                { totalCount: 0, totalMinutes: 0 }
        );
}

export type SrsHistoryEntry = {
  date: string;
  rating: string;
  duration: number;
  isCorrect: boolean;
};

export type SrsPrediction = {
  rating: Rating;
  label: string;
  nextDueDate: string;
  interval: number;
};

export const srsService = {
    /**
     * 根据答题耗时和题目长度计算 FSRS 评分 (Rating)
     * @param questionContent 题目内容
     * @param optionsJson 选项 JSON 字符串
     * @param durationMs 答题耗时（毫秒）
     * @param readingSpeed 阅读速度（字/秒）
     * @param questionType 题目类型
     * @param userAnswerLength 用户答案长度（填空题专用）
     */
    calculateRating: (questionContent: string, optionsJson: string, durationMs: number, readingSpeed: number, questionType?: string, userAnswerLength?: number): Rating => {
        let optionsText = '';
        try {
            const options = JSON.parse(optionsJson);
            if (Array.isArray(options)) optionsText = options.join('');
        } catch (_e) {
            optionsText = optionsJson || '';
        }

        const totalChars = questionContent.length + optionsText.length;
        const readingTimeSec = totalChars / readingSpeed;
        const totalDurationSec = durationMs / 1000;
        let thinkingTimeSec = Math.max(0, totalDurationSec - readingTimeSec);

        // 题型调整系数
        if (questionType === 'fill_blank' && userAnswerLength !== undefined && userAnswerLength > 0) {
            // 填空题：需要打字，扣除打字时间后评估
            const typingTimeSec = userAnswerLength / FILL_BLANK_TYPING_SPEED;
            thinkingTimeSec = Math.max(0, thinkingTimeSec - typingTimeSec);
            // 填空题思考时间打折（因为需要打字，实际思考时间更短）
            thinkingTimeSec *= FILL_BLANK_THINKING_TIME_DISCOUNT;
        } else if (questionType === 'multi') {
            // 多选需要对比多个选项，思考时间增加
            thinkingTimeSec *= 1.2;
        } else if (questionType === 'truefalse') {
            // 判断题二选一很快，思考时间减少
            thinkingTimeSec *= 0.5;
        }
        
        // 填空题使用专用阈值
        const thresholds = questionType === 'fill_blank' ? FILL_BLANK_THRESHOLDS : THINKING_TIME_THRESHOLDS;
        
        if (thinkingTimeSec < thresholds.EASY) {
            return Rating.Easy;
        } else if (thinkingTimeSec <= thresholds.GOOD) {
            return Rating.Good;
        } else {
            return Rating.Hard;
        }
    },

    /**
     * 获取或初始化题目的 SRS 状态
     */
    getOrCreateSrsCard: async (userId: number, questionId: number): Promise<Card> => {
        const [row] = await drizzleDb.select()
            .from(question_srs)
            .where(and(
                eq(question_srs.user_id, userId),
                eq(question_srs.question_id, questionId)
            ))
            .limit(1);

        if (row) {
            const card = createEmptyCard();
            card.due = new Date(row.due_date);
            card.stability = row.stability;
            card.difficulty = row.difficulty;
            card.elapsed_days = row.elapsed_days;
            card.scheduled_days = row.scheduled_days;
            card.reps = row.reps;
            card.lapses = row.lapses;
            card.state = mapDbStateToEnum(row.state);
            card.last_review = row.last_review ? new Date(row.last_review) : undefined;
            return card;
        }

        return createEmptyCard();
    },

    /**
     * 更新题目 SRS 状态
     * @throws {Error} 如果题目不存在
     */
    updateQuestionSrs: async (userId: number, questionId: number, isCorrect: boolean, durationMs: number, reviewDate?: Date, cachedReadingSpeed?: number, userAnswerLength?: number) => {
        const [question] = await drizzleDb.select()
            .from(questions)
            .where(eq(questions.id, questionId))
            .limit(1);
        if (!question) {
            throw new Error(`题目 ID ${questionId} 不存在，无法更新 SRS 状态`);
        }

        const card = await srsService.getOrCreateSrsCard(userId, questionId);

        let rating: Rating;
        if (!isCorrect) {
            rating = Rating.Again;
        } else {
            const readingSpeed = cachedReadingSpeed ?? await getReadingSpeed(userId, question.type || undefined);
            rating = srsService.calculateRating(
                question.content, 
                question.options || '[]', 
                durationMs, 
                readingSpeed,
                question.type || undefined,
                userAnswerLength
            );

            await learnReadingSpeed(userId, question.content, question.options || '[]', durationMs, question.type || undefined, userAnswerLength);
        }

        const now = reviewDate || new Date();
        const schedulingCards = f.repeat(card, now);
        const item = (schedulingCards as unknown as Record<Rating, RecordLogItem>)[rating].card;

        await drizzleDb.insert(question_srs).values({
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
            target: [question_srs.user_id, question_srs.question_id],
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
        const [result] = await drizzleDb.select({ count: sql<number>`count(*)` })
            .from(question_srs)
            .where(and(
                eq(question_srs.user_id, userId),
                lte(question_srs.due_date, new Date().toISOString())
            ));
        return Number(result?.count) || 0;
    },

    /**
     * 获取全局统计数据
     */
    getGlobalStats: async (userId: number): Promise<SrsGlobalStats> => {
        // 1. 状态分布
        const states = await drizzleDb.select({ state: question_srs.state, count: count() })
            .from(question_srs)
            .where(eq(question_srs.user_id, userId))
            .groupBy(question_srs.state);

        const stateDist = {
            new: Number(states.find(s => s.state === State.New)?.count || 0),
            learning: Number(states.find(s => s.state === State.Learning)?.count || 0),
            review: Number(states.find(s => s.state === State.Review)?.count || 0),
            relearning: Number(states.find(s => s.state === State.Relearning)?.count || 0),
        };

        // 2. 稳定性分布
        const stabilityRows = await drizzleDb.select({
            range: sql<string>`
                CASE 
                    WHEN ${question_srs.stability} < 1 THEN '<1d'
                    WHEN ${question_srs.stability} < 3 THEN '1-3d'
                    WHEN ${question_srs.stability} < 7 THEN '3-7d'
                    WHEN ${question_srs.stability} < 15 THEN '7-15d'
                    WHEN ${question_srs.stability} < 30 THEN '15-30d'
                    WHEN ${question_srs.stability} < 90 THEN '30-90d'
                    ELSE '90d+' 
                END`,
            count: count()
        })
        .from(question_srs)
        .where(eq(question_srs.user_id, userId))
        .groupBy(sql`1`);

        // 3. 难度分布
        const difficultyRows = await drizzleDb.select({
            range: sql<number>`CAST(${question_srs.difficulty} AS INTEGER)`,
            count: count()
        })
        .from(question_srs)
        .where(eq(question_srs.user_id, userId))
        .groupBy(sql`1`)
        .orderBy(sql`1 ASC`);

        // 4. 未来 7 天错题复习计划（只统计曾经答错的题目）
        const futureDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });

        const rawFutureRows = await drizzleDb.select({
            date: sql<string>`
                CASE
                    WHEN date(${question_srs.due_date}) <= date('now') THEN date('now')
                    ELSE date(${question_srs.due_date})
                END`,
            count: sql<number>`COUNT(DISTINCT ${question_srs.question_id})`
        })
        .from(question_srs)
        .innerJoin(practice_logs, and(
            eq(practice_logs.question_id, question_srs.question_id),
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false)
        ))
        .where(and(
            eq(question_srs.user_id, userId),
            sql`date(${question_srs.due_date}) <= date('now', '+7 days')`
        ))
        .groupBy(sql`1`);

        // 5. 真实保留率 (最近 30 天)
        const [retentionRow] = await drizzleDb.select({
            total: count(),
            correct: sql<number>`SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`
        })
        .from(practice_logs)
        .where(and(
            eq(practice_logs.user_id, userId),
            sql`${practice_logs.timestamp} > datetime('now', '-30 days')`
        ));

        // 6. 阅读速度
        const speedSettings = await drizzleDb.select()
            .from(system_settings)
            .where(and(
                eq(system_settings.user_id, userId),
                sql`${system_settings.key} LIKE 'reading_speed_%'`
            ));

        const readingSpeed = {
            base: parseFloat(speedSettings.find(s => s.key === 'reading_speed_base')?.value || '7.0'),
            multi: parseFloat(speedSettings.find(s => s.key === 'reading_speed_multi')?.value || '7.0'),
            truefalse: parseFloat(speedSettings.find(s => s.key === 'reading_speed_truefalse')?.value || '7.0'),
        };

        // 7. 样本数
        const [learnedCountRow] = await drizzleDb.select({ count: count() })
            .from(practice_logs)
            .innerJoin(questions, eq(practice_logs.question_id, questions.id))
            .where(and(
                eq(practice_logs.user_id, userId),
                eq(practice_logs.is_correct, true),
                sql`(LENGTH(${questions.content}) + LENGTH(COALESCE(${questions.options}, ''))) >= 10`,
                gte(practice_logs.duration_ms, 1000),
                lte(practice_logs.duration_ms, 60000)
            ));

        // 8. 预计复习耗时
        const [avgDurationRow] = await drizzleDb.select({
            avg_duration: sql<number>`AVG(${practice_logs.duration_ms})`
        })
        .from(practice_logs)
        .where(and(
            eq(practice_logs.user_id, userId),
            sql`${practice_logs.timestamp} > datetime('now', '-30 days')`,
            gte(practice_logs.duration_ms, 1000),
            lte(practice_logs.duration_ms, 60000)
        ));

        const avgDurationMs = avgDurationRow?.avg_duration || 15000;

        return {
            totalCards: Object.values(stateDist).reduce((a, b) => a + b, 0),
            stateDistribution: stateDist,
            stabilityDistribution: [
                { range: '<1d', count: stabilityRows.find(r => r.range === '<1d')?.count || 0 },
                { range: '1-3d', count: stabilityRows.find(r => r.range === '1-3d')?.count || 0 },
                { range: '3-7d', count: stabilityRows.find(r => r.range === '3-7d')?.count || 0 },
                { range: '7-15d', count: stabilityRows.find(r => r.range === '7-15d')?.count || 0 },
                { range: '15-30d', count: stabilityRows.find(r => r.range === '15-30d')?.count || 0 },
                { range: '30-90d', count: stabilityRows.find(r => r.range === '30-90d')?.count || 0 },
                { range: '90d+', count: stabilityRows.find(r => r.range === '90d+')?.count || 0 },
            ],
            difficultyDistribution: (difficultyRows || []).map(r => ({ range: (r.range ?? 0).toString(), count: r.count })),
            futureReviews: futureDays.map(day => {
                const count = rawFutureRows.find(r => r.date === day)?.count || 0;
                return {
                    date: day,
                    count,
                    estimatedMinutes: Math.ceil((count * avgDurationMs) / 60000)
                };
            }),
            retentionStats: {
                trueRetention: (retentionRow?.total || 0) > 0 ? ((retentionRow?.correct || 0) / (retentionRow?.total || 1)) * 100 : 100,
                totalReviews: retentionRow?.total || 0
            },
            readingSpeed,
            learnedCount: learnedCountRow?.count || 0
        };
    },

    /**
     * 从练习日志中同步数据到 SRS（批量 + 事务）
     * @param userId 用户 ID
     * @returns 同步的题目数量
     */
    syncFromPracticeLogs: async (userId: number) => {
        const speedCache: Record<string, number> = {
            'base': await getReadingSpeed(userId),
            'multi': await getReadingSpeed(userId, 'multi'),
            'truefalse': await getReadingSpeed(userId, 'truefalse'),
            'fill_blank': await getReadingSpeed(userId, 'fill_blank')
        };

        let totalSyncCount = 0;
        let hasMore = true;

        while (hasMore) {
            // 每次只查询 SYNC_BATCH_SIZE 个题目
            const logs = await drizzleDb.select({
                questionId: practice_logs.question_id,
                isCorrect: sql<number>`CAST(${practice_logs.is_correct} AS INTEGER)`,
                durationMs: practice_logs.duration_ms,
                timestamp: practice_logs.timestamp,
                userAnswer: practice_logs.user_answer
            })
            .from(practice_logs)
            .leftJoin(
                question_srs,
                and(
                    eq(question_srs.question_id, practice_logs.question_id),
                    eq(question_srs.user_id, userId)
                )
            )
            .where(and(
                eq(practice_logs.user_id, userId),
                isNull(question_srs.question_id)
            ))
            .orderBy(practice_logs.timestamp)
            .limit(SYNC_BATCH_SIZE);

            if (logs.length === 0) {
                hasMore = false;
                break;
            }

            // 如果不足一批，说明没有更多了
            if (logs.length < SYNC_BATCH_SIZE) {
                hasMore = false;
            }

            // 按题目分组
            const questionGroups = new Map<number, Array<{ questionId: number; isCorrect: number; durationMs: number | null; timestamp: string | null; userAnswer: string | null }>>();
            for (const log of logs) {
                if (!questionGroups.has(log.questionId)) {
                    questionGroups.set(log.questionId, []);
                }
                questionGroups.get(log.questionId)!.push(log);
            }

            // 使用事务批量处理
            try {
                await drizzleDb.transaction(async (tx) => {
                    for (const [qId, qLogs] of questionGroups.entries()) {
                        const [qInfo] = await tx.select({ type: questions.type })
                            .from(questions)
                            .where(eq(questions.id, qId))
                            .limit(1);

                        const typeKey = qInfo?.type === 'multi' ? 'multi' :
                                    qInfo?.type === 'truefalse' ? 'truefalse' :
                                    qInfo?.type === 'fill_blank' ? 'fill_blank' :
                                    'base';
                        const speed = speedCache[typeKey] || speedCache['base'];

                        for (const log of qLogs) {
                            const reviewDate = log.timestamp ? dayjs.utc(log.timestamp).toDate() : undefined;
                            const userAnswerLength = qInfo?.type === 'fill_blank' ? log.userAnswer?.length : undefined;
                            // updateQuestionSrs 现在会在题目不存在时抛出错误
                            try {
                                await srsService.updateQuestionSrs(userId, qId, log.isCorrect === 1, log.durationMs || 0, reviewDate, speed, userAnswerLength);
                            } catch (err) {
                                // 题目不存在时跳过，不阻塞整个同步
                                console.warn(`[syncFromPracticeLogs] 跳过题目 ${qId}: ${(err as Error).message}`);
                            }
                        }
                    }
                });
                totalSyncCount += questionGroups.size;
            } catch (err) {
                console.error('[syncFromPracticeLogs] 批量同步失败，已回滚:', err);
                throw err;
            }
        }

        return totalSyncCount;
    }
};
