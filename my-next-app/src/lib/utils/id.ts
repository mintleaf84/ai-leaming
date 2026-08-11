/**
 * 唯一 ID 生成工具
 * 统一使用 crypto.randomUUID，并兼容非安全上下文（如 http 局域网）的降级方案。
 */

function fallbackRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * 生成唯一 ID。
 * @param prefix 可选前缀，例如 "session" 会生成 "session-xxxx"
 * @param length 可选长度限制（去掉连字符后截取）
 */
export function generateId(prefix = "", length?: number): string {
  const globalCrypto = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  let raw: string;
  if (globalCrypto?.randomUUID) {
    raw = globalCrypto.randomUUID();
  } else {
    raw = fallbackRandomId();
  }

  const compact = raw.replace(/-/g, "");
  const body = length ? compact.slice(0, length) : compact;
  return prefix ? `${prefix}-${body}` : body;
}

/** 生成练习会话 ID */
export function generateSessionId(): string {
  return generateId("session", 15);
}
