'use server';
import logger from '@/lib/logger';

import { drizzleDb } from '@/lib/db';
import { users, questions, practice_logs, api_call_logs } from '@/lib/db/drizzle-schema';
import { eq, and, desc, like, sql, count, avg, sum } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/auth';

/**
 * 用户练习活动记录项
 */
export interface UserActivityEntry {
    id: number;
    user_id: number;
    username: string;
    question_id: number;
    question_content: string;
    user_answer: string | null;
    is_correct: boolean;
    duration_ms: number | null;
    timestamp: string | null;
    dimension: string | null;
}

/**
 * 活动查询筛选参数
 */
export interface ActivityFilters {
    userId?: number;
    isCorrect?: boolean;
    search?: string;
}

/**
 * 获取用户练习活动流水线
 */
export async function getUserActivityAction(
    limit: number = 50,
    offset: number = 0,
    filters?: ActivityFilters
) {
    await requireRole(['admin']);

    try {
        const whereConditions = [];

        if (filters?.userId) {
            whereConditions.push(eq(practice_logs.user_id, filters.userId));
        }
        if (filters?.isCorrect !== undefined) {
            whereConditions.push(eq(practice_logs.is_correct, filters.isCorrect));
        }
        if (filters?.search) {
            whereConditions.push(
                sql`(${users.username} LIKE ${`%${filters.search}%`} OR ${questions.content} LIKE ${`%${filters.search}%`})`
            );
        }

        const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

        // 查询总数
        const [totalResult] = await drizzleDb.select({ count: count() })
            .from(practice_logs)
            .leftJoin(users, eq(practice_logs.user_id, users.id))
            .leftJoin(questions, eq(practice_logs.question_id, questions.id))
            .where(whereClause);

        // 分页查询流水线
        const logs = await drizzleDb.select({
                id: practice_logs.id,
                user_id: practice_logs.user_id,
                username: users.username,
                question_id: practice_logs.question_id,
                question_content: questions.content,
                dimension: questions.dimension,
                user_answer: practice_logs.user_answer,
                is_correct: practice_logs.is_correct,
                duration_ms: practice_logs.duration_ms,
                timestamp: practice_logs.timestamp
            })
            .from(practice_logs)
            .leftJoin(users, eq(practice_logs.user_id, users.id))
            .leftJoin(questions, eq(practice_logs.question_id, questions.id))
            .where(whereClause)
            .orderBy(desc(practice_logs.timestamp))
            .limit(limit)
            .offset(offset);

        return {
            logs: logs.map(log => ({
                ...log,
                is_correct: Boolean(log.is_correct)
            })) as UserActivityEntry[],
            total: totalResult.count
        };
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch user activity');
        throw new Error('获取用户活动失败');
    }
}

/**
 * 获取活动统计概览
 */
export async function getActivityStatsAction() {
    await requireRole(['admin']);

    try {
        // 使用 SQLite 的 date() 函数进行当日统计
        const todayPredicate = sql`date(${practice_logs.timestamp}, 'localtime') = date('now', 'localtime')`;
        const aiTodayPredicate = sql`date(${api_call_logs.created_at}, 'localtime') = date('now', 'localtime')`;

        // 今日练习总数
        const [todayCountResult] = await drizzleDb.select({ count: count() })
            .from(practice_logs)
            .where(todayPredicate);

        // 今日正确率与平均耗时
        const [statsResult] = await drizzleDb.select({
                accuracy: sql<number>`(SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))`,
                avgDuration: avg(practice_logs.duration_ms)
            })
            .from(practice_logs)
            .where(todayPredicate);

        // AI 资源使用 (今日)
        const [aiStatsResult] = await drizzleDb.select({
                count: count(),
                tokens: sum(sql`${api_call_logs.input_tokens} + ${api_call_logs.output_tokens}`)
            })
            .from(api_call_logs)
            .where(and(aiTodayPredicate, eq(api_call_logs.success, 1)));

        return {
            todayCount: todayCountResult.count,
            accuracyRate: Math.round(statsResult?.accuracy || 0),
            avgDurationMs: Math.round(Number(statsResult?.avgDuration) || 0),
            aiCallsToday: aiStatsResult.count,
            aiTokensToday: Number(aiStatsResult.tokens) || 0
        };
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch activity stats');
        return {
            todayCount: 0,
            accuracyRate: 0,
            avgDurationMs: 0,
            aiCallsToday: 0,
            aiTokensToday: 0
        };
    }
}
