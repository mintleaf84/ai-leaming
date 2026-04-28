'use server';

import logger from '@/lib/logger';
import { requireRole } from '@/lib/auth/auth';
import { adminService } from '@/lib/services/admin-service';

/**
 * 活动查询筛选参数
 */
export interface ActivityFilters {
    userId?: number;
    isCorrect?: boolean;
    search?: string;
}

/**
 * 用户活动流水条目
 */
export interface UserActivityEntry {
    id: number;
    user_id: number;
    username: string | null;
    question_id: number;
    question_content: string | null;
    dimension: string | null;
    user_answer: string | null;
    is_correct: boolean;
    duration_ms: number | null;
    timestamp: string | null;
}

/**
 * 获取用户练习活动流水线 (管理员权限)
 */
export async function getUserActivityAction(
    limit: number = 50,
    offset: number = 0,
    filters?: ActivityFilters
) {
    try {
        await requireRole(['admin']);
        return await adminService.getActivityLogs(limit, offset, filters);
    } catch (error) {
        logger.error({ err: error }, '[ActivityAction] 获取用户活动失败');
        throw new Error('获取用户活动失败');
    }
}

/**
 * 获取活动统计概览 (管理员权限)
 */
export async function getActivityStatsAction() {
    try {
        await requireRole(['admin']);
        return await adminService.getActivityStats();
    } catch (error) {
        logger.error({ err: error }, '[ActivityAction] 获取活动统计失败');
        return {
            todayCount: 0,
            accuracyRate: 0,
            avgDurationMs: 0,
            aiCallsToday: 0,
            aiTokensToday: 0
        };
    }
}
