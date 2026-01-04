'use server';

import { getRecentLogs, getLogsByUser } from '@/lib/audit-service';
import { AdminLogEntry } from '@/lib/audit-types';
import { requireRole } from '@/lib/auth';

/**
 * 获取最近的管理员操作日志（仅限管理员）
 */
export async function getAdminLogsAction(limit: number = 50): Promise<AdminLogEntry[]> {
    await requireRole(['admin']);
    return getRecentLogs(limit);
}

/**
 * 获取指定用户的操作日志（仅限管理员）
 */
export async function getLogsByUserAction(userId: number, limit: number = 50): Promise<AdminLogEntry[]> {
    await requireRole(['admin']);
    return getLogsByUser(userId, limit);
}
