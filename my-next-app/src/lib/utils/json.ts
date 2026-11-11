/**
 * 安全解析 JSON，失败时返回默认值
 */
export function safeParseJson<T>(
  value: string | null | undefined,
  defaultValue: T,
): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    // audit-allow: 本函数契约就是"解析失败返回默认值"，失败不是异常而是正常分支
    return defaultValue;
  }
}
