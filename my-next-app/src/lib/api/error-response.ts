/**
 * 业务错误 → HTTP 响应（**唯一**的映射点）。
 *
 * 路由里不要再写 `instanceof XxxError ? 400 : 500` 的链条：领域类继承
 * `AppError` 之后，状态码由 `kind` 决定，这里只负责渲染。
 */

import type { Context } from "hono";
import { isAppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";

/** 校验明细默认截断条数：上百张卡的卡组会一次报出几十条 issue */
const DEFAULT_MAX_ISSUES = 20;

export interface ErrorResponseOptions {
  maxIssues?: number;
  /** 记录日志时的标签，便于在日志里定位是哪个路由 */
  scope?: string;
}

export function toErrorResponse(
  c: Context,
  error: unknown,
  options: ErrorResponseOptions = {},
) {
  if (isAppError(error)) {
    const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
    const body = error.issues
      ? {
          error: error.publicMessage,
          code: error.code,
          issues: error.issues.slice(0, maxIssues),
          issueCount: error.issues.length,
        }
      : { error: error.publicMessage, code: error.code };
    return c.json(body, error.status as 400);
  }

  logger.error(
    { err: error, scope: options.scope ?? "api" },
    "[API] 未归类的服务端错误",
  );
  return c.json({ error: "服务器内部错误", code: "internal" }, 500);
}
