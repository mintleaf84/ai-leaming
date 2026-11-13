/**
 * 写操作审计日志。
 *
 * 只记录写请求（POST/PATCH/PUT/DELETE）；读请求量大且无审计价值，不入库。
 * 审计失败只记日志、绝不抛出——审计不能影响业务。
 */
import type { Context } from "hono";
import type { MiddlewareHandler } from "hono";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { getApiKeyIdentity } from "@/lib/api/middlewares/api-key";
import { after } from "next/server";
import { logger } from "@/lib/logger";

/** 尽量在响应发完之后执行；不在 Next 请求作用域（如单测）时退化为立即异步 */
function scheduleAfter(task: () => Promise<void>) {
  try {
    after(task);
  } catch (err) {
    // audit-allow: 不在 Next 请求作用域（单测直接调 app.request）时 after() 会抛，
    // 退化为立即异步执行即可
    logger.warn({ err }, "[ApiAudit] after() 不可用，退化为立即写入");
    void task();
  }
}

export const AUDITED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export interface ApiAuditEntry {
  keyId: number | null;
  userId: number | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

/**
 * 写入一条审计记录。失败只 log.error，不抛出。
 */
export async function logApiAudit(entry: ApiAuditEntry): Promise<void> {
  try {
    await drizzleDb.insert(drizzleSchema.api_audit_logs).values({
      key_id: entry.keyId,
      user_id: entry.userId,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      duration_ms: Math.max(0, Math.round(entry.durationMs)),
    });
  } catch (err) {
    // 审计是旁路：写入失败只记日志，绝不影响业务响应（下方 return 即显式降级）
    logger.error({ err }, "[ApiAudit] 写入审计日志失败");
    return;
  }
}

/**
 * 写操作审计中间件：仅对 POST/PATCH/PUT/DELETE 记录，
 * 身份取自 requireScope 已解析的 Context（无 key 时记 null）。
 */
export function apiAuditForWrites(): MiddlewareHandler {
  return async (c: Context, next) => {
    const method = c.req.method.toUpperCase();
    if (!AUDITED_METHODS.has(method)) {
      await next();
      return;
    }

    const startedAt = Date.now();
    await next();

    const identity = getApiKeyIdentity(c);
    // 只记"能追溯到某把 key"的写请求：
    //   - 已认证但越权（403）要记；
    //   - 完全匿名（无 key / 无效 key → 401）不记，否则任何人发 POST 都能把表灌满。
    if (!identity) return;

    // 审计是旁路，不能拖慢响应：交给 after() 在响应之后写。
    const entry = {
      keyId: identity.keyId,
      userId: identity.effectiveUserId,
      method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    };
    scheduleAfter(async () => logApiAudit(entry));
  };
}
