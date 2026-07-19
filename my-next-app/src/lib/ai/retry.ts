/**
 * AI 请求重试逻辑
 */

/**
 * 指数退避重试辅助函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (retries <= 0) throw error;

    // 仅针对可重试的错误进行重试 (如 429, 500, 502, 503, 504)
    const status =
      error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;

    // 如果没有状态码（可能是网络错误）或者是在特定的 HTTP 状态码范围内，则重试
    const isRetryable = !status || [429, 500, 502, 503, 504].includes(status);

    if (isRetryable) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[AiRetry] 发生错误，正在重试 (${retries} 次剩余):`, msg);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}
