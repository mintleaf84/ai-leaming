/**
 * SQL 脚本执行服务
 * 提供安全的 SQL 脚本执行能力，包含：
 * - SQL 安全校验（防止注入和危险操作）
 * - 执行前自动备份
 * - 事务保证原子性
 * - 并发控制
 */

import { drizzleDb, getLegacyDb, drizzleSchema } from '@/lib/db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

// 危险 SQL 关键字黑名单（禁止执行）
const DANGEROUS_KEYWORDS = [
    'DROP',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'GRANT',
    'REVOKE',
    'ATTACH',
    'DETACH',
    'PRAGMA',
    'REINDEX',
    'VACUUM',
    'LOAD_EXTENSION',
    'SELECT load_extension'
];

// 需要 WHERE 条件的语句
const REQUIRE_WHERE = ['DELETE', 'UPDATE'];

// 执行锁（防止并发执行多个脚本）
let isExecuting = false;

export interface SqlScriptExecutionResult {
    success: boolean;
    rowsAffected?: number;
    error?: string;
    backupPath?: string;
    executionTime?: number;
}

export interface SqlScriptValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
    estimatedRows?: number;
}

export class SqlScriptService {
    /**
     * 验证 SQL 脚本的安全性
     */
    static validateScript(sqlContent: string): SqlScriptValidationResult {
        const warnings: string[] = [];
        const upper = sqlContent.toUpperCase();

        // 1. 检查黑名单关键字
        for (const keyword of DANGEROUS_KEYWORDS) {
            if (upper.includes(keyword)) {
                return {
                    valid: false,
                    error: `禁止使用 ${keyword} 语句，该操作可能导致数据丢失或系统不稳定`
                };
            }
        }

        // 2. 检查 DELETE/UPDATE 是否带 WHERE
        for (const keyword of REQUIRE_WHERE) {
            if (upper.includes(keyword)) {
                // 简单的 WHERE 检查（可能误判复杂 SQL，但作为第一道防线）
                const hasWhere = upper.includes('WHERE');
                if (!hasWhere) {
                    return {
                        valid: false,
                        error: `${keyword} 语句必须包含 WHERE 条件，防止误删全表数据`
                    };
                }
            }
        }

        // 3. 检查多语句执行（分号分隔）
        const statements = sqlContent.split(';').filter(s => s.trim().length > 0);
        if (statements.length > 10) {
            warnings.push(`检测到 ${statements.length} 条 SQL 语句，建议分批执行`);
        }

        // 4. 检查是否有注释（可能隐藏恶意代码）
        if (sqlContent.includes('--') || sqlContent.includes('/*')) {
            warnings.push('SQL 包含注释，执行前请确认注释内容');
        }

        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * 估算 SQL 影响的行数（仅用于 DELETE/UPDATE）
     */
    static async estimateRowsAffected(sqlContent: string): Promise<number | null> {
        try {
            const upper = sqlContent.toUpperCase().trim();
            
            if (upper.startsWith('DELETE') || upper.startsWith('UPDATE')) {
                const prefix = upper.startsWith('DELETE') ? 'DELETE FROM' : 'UPDATE';
                const whereIndex = upper.indexOf('WHERE');
                if (whereIndex === -1) return null;
                
                const tableName = this.extractTableName(sqlContent, prefix);
                if (!tableName) return null;
                
                const whereClause = sqlContent.slice(whereIndex);
                const result = await drizzleDb.all(
                    sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)} ${sql.raw(whereClause)}`
                ) as unknown as { count: number }[];
                return result[0]?.count || 0;
            }

            return null;
        } catch (error) {
            console.error('[SqlScript] 估算影响行数失败:', error);
            return null;
        }
    }

    /**
     * 从 SQL 中提取表名
     */
    private static extractTableName(sql: string, prefix: string): string | null {
        const upper = sql.toUpperCase();
        const prefixIndex = upper.indexOf(prefix);
        if (prefixIndex === -1) return null;

        const afterPrefix = sql.slice(prefixIndex + prefix.length).trim();
        const tableName = afterPrefix.split(/\s+/)[0].trim();
        return tableName.replace(/["`\[\]]/g, '');
    }

    /**
     * 执行 SQL 脚本（带备份和事务）
     */
    static async executeWithBackup(
        sqlContent: string,
        description: string,
        userId: number
    ): Promise<SqlScriptExecutionResult> {
        // 1. 检查并发锁
        if (isExecuting) {
            return {
                success: false,
                error: '当前有其他脚本正在执行，请稍后再试'
            };
        }

        // 2. 安全校验
        const validation = this.validateScript(sqlContent);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error
            };
        }

        isExecuting = true;
        const startTime = Date.now();
        let backupPath: string | undefined;

        try {
            // 3. 创建本地备份
            const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
            const timestamp = Date.now();
            backupPath = path.resolve(process.cwd(), 'data', `ai-learning.db.sql-backup-${timestamp}`);

            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, backupPath);
            }

            // 4. 执行 SQL（使用事务）
            const legacyDb = getLegacyDb();
            
            // 开启事务
            legacyDb.exec('BEGIN TRANSACTION');

            try {
                // 分割多语句执行
                const statements = sqlContent
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                let totalRowsAffected = 0;

                for (const statement of statements) {
                    legacyDb.exec(statement);
                    const info = legacyDb.prepare('SELECT changes() as changes').get() as { changes: number };
                    totalRowsAffected += info?.changes || 0;
                }

                // 提交事务
                legacyDb.exec('COMMIT');

                const executionTime = Date.now() - startTime;

                // 5. 记录审计日志
                await drizzleDb.insert(drizzleSchema.admin_logs).values({
                    user_id: userId,
                    username: 'admin',
                    action: 'EXECUTE_SQL_SCRIPT',
                    target_type: 'system',
                    target_id: null,
                    details: JSON.stringify({
                        description,
                        rowsAffected: totalRowsAffected,
                        executionTime,
                        backupCreated: backupPath ? path.basename(backupPath) : null
                    }),
                    ip_address: null
                });

                // 6. 如果成功，备份保留 7 天
                // （cleanup 会在 scheduler 中定期执行）

                return {
                    success: true,
                    rowsAffected: totalRowsAffected,
                    backupPath: backupPath ? path.basename(backupPath) : undefined,
                    executionTime
                };
            } catch (execError) {
                // 执行失败，回滚事务
                legacyDb.exec('ROLLBACK');
                throw execError;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 记录失败日志
            await drizzleDb.insert(drizzleSchema.admin_logs).values({
                user_id: userId,
                username: 'admin',
                action: 'EXECUTE_SQL_SCRIPT',
                target_type: 'system',
                target_id: null,
                details: JSON.stringify({
                    description,
                    error: errorMessage,
                    backupCreated: backupPath ? path.basename(backupPath) : null
                }),
                ip_address: null
            });

            return {
                success: false,
                error: errorMessage,
                backupPath: backupPath ? path.basename(backupPath) : undefined
            };
        } finally {
            isExecuting = false;
        }
    }

    /**
     * 获取最近的脚本执行历史
     */
    static async getExecutionHistory(limit = 20) {
        const history = await drizzleDb.query.admin_logs.findMany({
            where: sql`${sql.identifier('action')} = 'EXECUTE_SQL_SCRIPT'`,
            orderBy: (logs, { desc }) => [desc(logs.created_at)],
            limit
        });

        return history.map(log => {
            let details: Record<string, unknown> = {};
            try {
                if (log.details) {
                    details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                }
            } catch { /* ignore parse errors */ }

            return {
                id: log.id,
                timestamp: log.created_at,
                userId: log.user_id,
                description: (details.description as string) || '未知脚本',
                success: !(details.error as string),
                rowsAffected: details.rowsAffected as number | null,
                executionTime: details.executionTime as number | null,
                backupFile: details.backupCreated as string | null,
                error: details.error as string | null
            };
        });
    }

    /**
     * 清理过期的脚本备份（保留 7 天）
     */
    static async cleanupOldBackups() {
        const backupDir = path.resolve(process.cwd(), 'data');
        const retentionDays = 7;
        const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        let deleted = 0;

        try {
            const files = fs.readdirSync(backupDir);
            
            for (const file of files) {
                if (file.includes('sql-backup-')) {
                    const filePath = path.join(backupDir, file);
                    const stat = fs.statSync(filePath);
                    
                    if (stat.mtimeMs < cutoffTime) {
                        fs.unlinkSync(filePath);
                        deleted++;
                    }
                }
            }

            return { deleted };
        } catch (error) {
            console.error('[SqlScript] 清理备份失败:', error);
            return { deleted: 0, error };
        }
    }
}
