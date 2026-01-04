/**
 * 管理员操作审计服务
 * 记录管理员在后台的所有操作，便于审计和问题追溯
 */

import db from '@/lib/db';
import { AdminAction, TargetType, AdminLogEntry, formatActionName } from './audit-types';

export type { AdminAction, TargetType, AdminLogEntry };
export { formatActionName };

/**
 * 记录管理员操作
 */
export function logAdminAction(
    userId: number,
    username: string,
    action: AdminAction,
    targetType: TargetType = null,
    targetId: string | null = null,
    details: Record<string, any> | null = null,
    ipAddress: string | null = null
): void {
    try {
        const stmt = db.prepare(`
      INSERT INTO admin_logs (user_id, username, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            userId,
            username,
            action,
            targetType,
            targetId,
            details ? JSON.stringify(details) : null,
            ipAddress
        );
    } catch (error) {
        console.error('Failed to log admin action:', error);
        // 不抛出错误，避免影响主业务
    }
}

/**
 * 获取最近的操作日志
 */
export function getRecentLogs(limit: number = 50): AdminLogEntry[] {
    const stmt = db.prepare(`
    SELECT * FROM admin_logs
    ORDER BY created_at DESC
    LIMIT ?
  `);
    return stmt.all(limit) as AdminLogEntry[];
}

/**
 * 获取指定用户的操作日志
 */
export function getLogsByUser(userId: number, limit: number = 50): AdminLogEntry[] {
    const stmt = db.prepare(`
    SELECT * FROM admin_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
    return stmt.all(userId, limit) as AdminLogEntry[];
}

/**
 * 获取指定操作类型的日志
 */
export function getLogsByAction(action: AdminAction, limit: number = 50): AdminLogEntry[] {
    const stmt = db.prepare(`
    SELECT * FROM admin_logs
    WHERE action = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
    return stmt.all(action, limit) as AdminLogEntry[];
}
