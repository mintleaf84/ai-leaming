/**
 * 系统健康监控服务
 * 提供数据库统计、系统信息等监控指标
 */

import { db } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';
import { getApiCallStats, ApiCallStats } from '@/lib/admin/api-stats-service';

export interface TableStats {
    name: string;
    rowCount: number;
}

export interface DatabaseStats {
    sizeBytes: number;
    sizeFormatted: string;
    tables: TableStats[];
    totalRows: number;
}

export interface SystemInfo {
    nodeVersion: string;
    platform: string;
    uptime: number;
    uptimeFormatted: string;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        formatted: {
            heapUsed: string;
            heapTotal: string;
            rss: string;
        };
    };
}

export interface HealthStats {
    database: DatabaseStats;
    system: SystemInfo;
    apiStats: ApiCallStats;
    timestamp: string;
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);

    return parts.length > 0 ? parts.join(' ') : '刚刚启动';
}

/**
 * 获取数据库统计信息
 */
export function getDatabaseStats(): DatabaseStats {
    // 获取数据库文件大小
    const dbPath = path.join(process.cwd(), 'database.sqlite');
    let sizeBytes = 0;

    try {
        const stats = fs.statSync(dbPath);
        sizeBytes = stats.size;
    } catch (e) {
        console.warn('无法获取数据库文件大小:', e);
    }

    // 获取所有表名
    const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '%_vec%'
    ORDER BY name
  `).all() as { name: string }[];

    // 获取每个表的行数
    const tableStats: TableStats[] = tables.map(t => {
        try {
            const result = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get() as { count: number };
            return { name: t.name, rowCount: result.count };
        } catch (_e) {
            return { name: t.name, rowCount: 0 };
        }
    });

    const totalRows = tableStats.reduce((sum, t) => sum + t.rowCount, 0);

    return {
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        tables: tableStats,
        totalRows,
    };
}

/**
 * 获取系统运行信息
 */
export function getSystemInfo(): SystemInfo {
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    return {
        nodeVersion: process.version,
        platform: process.platform,
        uptime,
        uptimeFormatted: formatUptime(uptime),
        memoryUsage: {
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            rss: memory.rss,
            formatted: {
                heapUsed: formatBytes(memory.heapUsed),
                heapTotal: formatBytes(memory.heapTotal),
                rss: formatBytes(memory.rss),
            },
        },
    };
}

/**
 * 获取完整的健康统计信息
 */
export async function getHealthStats(): Promise<HealthStats> {
    return {
        database: getDatabaseStats(),
        system: getSystemInfo(),
        apiStats: await getApiCallStats(),
        timestamp: new Date().toISOString(),
    };
}
