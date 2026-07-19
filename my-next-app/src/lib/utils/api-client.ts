/**
 * 通用 API Client
 * 封装 fetch 的自动重试和错误处理，可作为 React Query 的 fetcher 直接使用。
 */

interface RequestOptions extends RequestInit {
  retries?: number;
  backoffFactor?: number; // 单位 ms
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF = 500; // ms

/** 标准化的 API 错误，携带 HTTP 状态码 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string,
  ) {
    super(message || `API Error: ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

/**
 * 带自动重试的 fetch 封装。
 * 对 5xx 和 429 错误自动重试，使用指数退避 + 抖动策略。
 */
export async function fetchWithRetry(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const {
    retries = DEFAULT_RETRIES,
    backoffFactor = DEFAULT_BACKOFF,
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, fetchOptions);

      // 5xx 或 429 触发重试
      if (response.status >= 500 || response.status === 429) {
        throw new ApiError(
          response.status,
          response.statusText,
          `Server error ${response.status}`,
        );
      }

      return response;
    } catch (error) {
      lastError = error;

      // 重试次数用尽则退出
      if (i === retries) break;

      const waitTime = backoffFactor * Math.pow(2, i);
      const jitter = Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, waitTime + jitter));
    }
  }

  throw lastError;
}

/**
 * 适配 React Query 的 JSON Fetcher。
 * 自动检查响应状态并解析 JSON，失败时抛出 ApiError。
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    // 尝试解析 JSON 错误体，解析失败则用 statusText
    let message: string | undefined;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await response.json()) as Record<string, unknown>;
        message = (body.error || body.message) as string | undefined;
      } catch {
        /* ignore parse error */
      }
    }
    throw new ApiError(response.status, response.statusText, message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      response.status,
      "InvalidResponse",
      `期望 JSON 但收到 ${contentType || "未知类型"}`,
    );
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: (url: string, options?: RequestOptions) =>
    fetchWithRetry(url, { ...options, method: "GET" }),

  post: (url: string, body: unknown, options?: RequestOptions) =>
    fetchWithRetry(url, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    }),

  put: (url: string, body: unknown, options?: RequestOptions) =>
    fetchWithRetry(url, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    }),

  delete: (url: string, options?: RequestOptions) =>
    fetchWithRetry(url, { ...options, method: "DELETE" }),
};
