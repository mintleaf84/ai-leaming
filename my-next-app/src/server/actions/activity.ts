'use server';
import logger from '@/lib/logger';

import { db } from '@/lib/db';
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
    user_answer: string;
    is_correct: boolean;
    duration_ms: number;
    timestamp: string;
    dimension: string;
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
        const conditions: string[] = [];
        const params: (string | number | null)[] = [];

        if (filters?.userId) {
            conditions.push('pl.user_id = ?');
            params.push(filters.userId);
        }
        if (filters?.isCorrect !== undefined) {
            conditions.push('pl.is_correct = ?');
            params.push(filters.isCorrect ? 1 : 0);
        }
        if (filters?.search) {
            conditions.push('(u.username LIKE ? OR q.content LIKE ?)');
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // 查询总数
        const countSql = `
            SELECT COUNT(*) as count 
            FROM practice_logs pl
            LEFT JOIN users u ON pl.user_id = u.id
            LEFT JOIN questions q ON pl.question_id = q.id
            ${whereClause}
        `;
        const total = db.prepare(countSql).get(...params) as { count: number };

        // 分页查询流水线
        const dataSql = `
            SELECT 
                pl.id, pl.user_id, u.username, 
                pl.question_id, q.content as question_content, q.dimension,
                pl.user_answer, pl.is_correct, pl.duration_ms, pl.timestamp
            FROM practice_logs pl
            LEFT JOIN users u ON pl.user_id = u.id
            LEFT JOIN questions q ON pl.question_id = q.id
            ${whereClause}
            ORDER BY pl.timestamp DESC
            LIMIT ? OFFSET ?
        `;
        
        const logs = db.prepare(dataSql).all(...params, limit, offset) as UserActivityEntry[];

        return {
            logs: logs.map(log => ({
                ...log,
                is_correct: Boolean(log.is_correct)
            })),
            total: total.count
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
        const _today = new Date().toISOString().split('T')[0];

        // 今日练习总数
        const todayCount = db.prepare(`
            SELECT COUNT(*) as count FROM practice_logs 
            WHERE date(timestamp) = date('now', 'localtime')
        `).get() as { count: number };

        // 今日正确率
        const accuracy = db.prepare(`
            SELECT 
                CASE WHEN COUNT(*) > 0 
                THEN (SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                ELSE 0 END as rate
            FROM practice_logs
            WHERE date(timestamp) = date('now', 'localtime')
        `).get() as { rate: number };

        // 平均耗时
        const avgDuration = db.prepare(`
            SELECT AVG(duration_ms) as avg_time 
            FROM practice_logs 
            WHERE date(timestamp) = date('now', 'localtime')
        `).get() as { avg_time: number };

        // AI 资源使用 (今日)
        const aiCalls = db.prepare(`
            SELECT COUNT(*) as count, SUM(input_tokens + output_tokens) as tokens
            FROM api_call_logs
            WHERE date(created_at) = date('now', 'localtime') AND success = 1
        `).get() as { count: number, tokens: number };

        return {
            todayCount: todayCount.count,
            accuracyRate: Math.round(accuracy.rate),
            avgDurationMs: Math.round(avgDuration.avg_time || 0),
            aiCallsToday: aiCalls.count,
            aiTokensToday: aiCalls.tokens || 0
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
