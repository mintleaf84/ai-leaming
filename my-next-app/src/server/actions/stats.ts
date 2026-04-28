'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { cache } from 'react';
import { statsService, type UserStats, type TrendDataItem } from '@/lib/services/stats';


/**
 * 获取用户首页仪表盘统计数据 (Cached per request)
 */
export const getUserStatsAction = cache(async (): Promise<UserStats> => {
    try {
        const user = await requireUser();
        return await statsService.getUserStats(user.id);
    } catch (error) {
        logger.error({ err: error }, "[StatsAction] 获取用户统计失败");
        // 返回兜底数据
        return {
            totalPracticed: 0,
            totalCorrect: 0,
            totalSessions: 0,
            averageMastery: 0,
            weakPoints: [],
            todayPracticed: 0,
            todayCorrect: 0,
            pendingReviewCount: 0,
            observationZoneCount: 0,
            streakDays: 0,
            dailyGoal: 25,
            dailyProgress: 0
        };
    }
});

/**
 * 获取练习趋势数据 (近 N 天) (Cached per request)
 */
export const getPracticeTrendAction = cache(async (days: number = 14): Promise<TrendDataItem[]> => {
    try {
        const user = await requireUser();
        return await statsService.getPracticeTrend(user.id, days);
    } catch (error) {
        logger.error({ err: error }, "[StatsAction] 获取练习趋势失败");
        return [];
    }
});