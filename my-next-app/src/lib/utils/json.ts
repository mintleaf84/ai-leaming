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

/**
 * 解析"可能是 JSON 文本、也可能已经是解析好的值"的列。
 *
 * 数据库里 options/tags 是 text，但同一条记录在经过某些转换（admin 导入、缓存回放）
 * 后可能已经是数组/对象。以前各处手写 `typeof x === "string" ? JSON.parse(x) : x || []`，
 * 一旦有人把它换成 `safeParseJson`，非字符串的真值就会被当成"空"丢掉（有回归用例覆盖）。
 */
export function coerceJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    return safeParseJson<T>(value, fallback);
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
}
