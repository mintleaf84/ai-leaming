/**
 * 错误处理工具函数
 * Error handling utilities
 *
 * 避免在 catch 块中使用 `error: any`，统一使用 `unknown` + 这些工具函数
 */

/**
 * 从 unknown 类型的错误中安全提取错误消息字符串
 */
export function getErrorMessage(error: unknown, fallback = "未知错误"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

/**
 * SQLite 特有错误接口，包含 code 属性
 * better-sqlite3 抛出的约束错误会带有 code 字段
 */
export interface SqliteError extends Error {
  code?: string;
}

/**
 * 判断是否为指定 code 的 SQLite 约束错误
 * @param error - catch 到的错误
 * @param code  - 期望的错误码，如 'SQLITE_CONSTRAINT_UNIQUE'
 */
export function isSqliteConstraintError(error: unknown, code: string): boolean {
  return error instanceof Error && (error as SqliteError).code === code;
}
