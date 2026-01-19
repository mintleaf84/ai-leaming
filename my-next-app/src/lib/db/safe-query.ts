import { z } from 'zod';
import { Statement } from 'better-sqlite3';

/**
 * 安全地执行单条查询并验证结果
 * @param stmt better-sqlite3 预编译语句
 * @param params 查询参数
 * @param schema Zod 验证模式
 */
export function safeGet<T>(stmt: Statement, params: any[], schema: z.ZodSchema<T>): T | null {
    const result = stmt.get(...params);
    if (!result) return null;
    return schema.parse(result);
}

/**
 * 安全地执行列表查询并验证结果
 * @param stmt better-sqlite3 预编译语句
 * @param params 查询参数
 * @param schema Zod 验证模式
 */
export function safeAll<T>(stmt: Statement, params: any[], schema: z.ZodSchema<T>): T[] {
    const results = stmt.all(...params);
    return z.array(schema).parse(results);
}
