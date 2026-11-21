/**
 * 题集接口的错误文案映射（纯函数，可在单测里直接断言）。
 *
 * 服务端回的业务文案（`{error}` / `{message}`）优先——「这题已经反馈过了」
 * 这种话只有服务端知道；服务端没给可读文案时才按状态码兜底。
 * 页面拿到的一律是**人话**，不会出现 "HTTP 409" 这类内部说法。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 从响应体里取服务端给的文案；空串、非字符串都算没给 */
export function serverMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  for (const key of ["error", "message", "detail"] as const) {
    const raw = body[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

/**
 * 状态码 → 用户可读的兜底文案。`status === 0` 表示请求没有发出去（断网、DNS 失败）。
 */
export function describeRequestError(status: number, body?: unknown): string {
  const fromServer = serverMessage(body);
  if (fromServer) return fromServer;

  switch (status) {
    case 0:
      return "网络连接失败，请检查网络后重试";
    case 400:
      return "请求没有通过校验，请稍后再试";
    case 401:
      return "登录状态已失效，请重新登录后再试";
    case 403:
      return "没有权限查看这个题集";
    case 404:
      return "题集不存在，或已经被删除了";
    case 409:
      return "这个操作已经完成过，刷新后再看看";
    case 422:
      return "这批题暂时还不满足条件，换个方式再试";
    case 429:
      return "操作太频繁了，请稍等一会儿再试";
    default:
      return `请求失败（${status}），请稍后重试`;
  }
}

/** 成卷时题库题量不足的 400：body 里带着数字，调用方可据此提示可放宽的条件 */
export interface ShortfallInfo {
  requested: number;
  available: number;
}

export function readShortfall(body: unknown): ShortfallInfo | null {
  if (!isRecord(body)) return null;
  const requested = body.requested;
  const available = body.available;
  if (typeof requested !== "number" || typeof available !== "number") {
    return null;
  }
  return { requested, available };
}
