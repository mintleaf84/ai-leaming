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
    return defaultValue;
  }
}
