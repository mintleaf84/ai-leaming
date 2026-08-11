/**
 * 通用指数退避重试
 */

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];

/** 判断错误是否可重试：无状态码（网络错误）或在可重试状态码范围内 */
function isRetryableError(error: unknown): boolean {
  const status =
    error instanceof Error
      ? (error as Error & { status?: number }).status
      : undefined;
  return !status || RETRYABLE_STATUS.includes(status);
}

/**
 * 指数退避重试辅助函数
 * @param fn 待重试的异步函数
 * @param retries 最大重试次数
 * @param delay 初始退避间隔 (ms)，每次翻倍
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
    if (!isRetryableError(error)) throw error;

    console.warn(
      `[Retry] 发生错误，正在重试 (${retries} 次剩余):`,
      error instanceof Error ? error.message : String(error),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}
