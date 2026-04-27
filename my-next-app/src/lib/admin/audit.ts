/**
 * 管理员操作审计服务
 * 记录管理员在后台的所有操作，便于审计和问题追溯
 */

import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import { AdminAction, TargetType, AdminLogEntry, formatActionName } from '@/types/admin';

export type { AdminAction, TargetType, AdminLogEntry };
export { formatActionName };

/**
 * 记录管理员操作
 */
export async function logAdminAction(
    userId: number,
    username: string,
    action: AdminAction,
    targetType: TargetType = null,
    targetId: string | null = null,
    details: Record<string, unknown> | null = null,
    ipAddress: string | null = null
): Promise<void> {
    try {
        await drizzleDb.insert(drizzleSchema.admin_logs).values({
            user_id: userId,
            username,
            action: action as any,
            target_type: targetType as any,
            target_id: targetId,
            details: details ? JSON.stringify(details) : null,
            ip_address: ipAddress
        });
    } catch (error) {
        console.error('Failed to log admin action:', error);
        // 不抛出错误，避免影响主业务流
    }
}

/**
 * 获取最近的操作日志
 */
export async function getRecentLogs(limit: number = 50): Promise<AdminLogEntry[]> {
    return await drizzleDb.select()
        .from(drizzleSchema.admin_logs)
        .orderBy(desc(drizzleSchema.admin_logs.created_at))
        .limit(limit) as AdminLogEntry[];
}

/**
 * 获取指定用户的操作日志
 */
export async function getLogsByUser(userId: number, limit: number = 50): Promise<AdminLogEntry[]> {
    return await drizzleDb.select()
        .from(drizzleSchema.admin_logs)
        .where(eq(drizzleSchema.admin_logs.user_id, userId))
        .orderBy(desc(drizzleSchema.admin_logs.created_at))
        .limit(limit) as AdminLogEntry[];
}

/**
 * 获取指定操作类型的日志
 */
export async function getLogsByAction(action: AdminAction, limit: number = 50): Promise<AdminLogEntry[]> {
    return await drizzleDb.select()
        .from(drizzleSchema.admin_logs)
        .where(eq(drizzleSchema.admin_logs.action, action as any))
        .orderBy(desc(drizzleSchema.admin_logs.created_at))
        .limit(limit) as AdminLogEntry[];
}
