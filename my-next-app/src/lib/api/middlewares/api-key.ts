/**
 * API Key 鉴权中间件（REST 外部接口唯一入口）。
 *
 * 设计要点：
 *   - 身份：api_keys.user_id 为 NULL 表示"全局 key"，语义等价于站长身份，
 *     操作身份取 API_GLOBAL_USER_ID（缺省 1）。
 *   - 作用域：read ⊂ write ⊂ admin，递进包含。
 *   - last_used_at 的更新走 after()，不阻塞请求；非 Next 请求作用域
 *     （单测里直接调用 app.request）时退化为即时异步执行。
 */
import type { Context } from "hono";
import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { logger } from "@/lib/logger";

export type ApiScope = "read" | "write" | "admin";

/** 作用域可见等级：数字越大权限越高（admin ⊃ write ⊃ read） */
const SCOPE_RANK: Record<ApiScope, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

export interface ResolvedApiKey {
  keyId: number;
  /** 原始绑定身份；null 表示全局 key */
  userId: number | null;
  /** 实际操作身份（全局 key 已解析为 API_GLOBAL_USER_ID） */
  effectiveUserId: number;
  scope: ApiScope;
  isGlobal: boolean;
}

/** 全局 key 的兜底身份（站长） */
const DEFAULT_GLOBAL_USER_ID = 1;

export function resolveGlobalUserId(): number {
  const parsed = Number(process.env.API_GLOBAL_USER_ID);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return DEFAULT_GLOBAL_USER_ID;
}

export function normalizeScope(raw: string | null | undefined): ApiScope {
  if (raw === "write" || raw === "admin") return raw;
  return "read";
}

/** required 是否被 granted 满足（admin ⊃ write ⊃ read） */
export function scopeSatisfies(granted: ApiScope, required: ApiScope): boolean {
  return SCOPE_RANK[granted] >= SCOPE_RANK[required];
}

// Hono 在整个中间件链条中复用同一个 Context 实例，用 WeakMap 传递解析结果即可，
// 无需给每个 OpenAPIHono 实例声明 Variables 类型。
const identityStore = new WeakMap<Context, ResolvedApiKey>();

export function getApiKeyIdentity(c: Context): ResolvedApiKey | undefined {
  return identityStore.get(c);
}

function scheduleBackground(task: () => Promise<unknown>, label: string) {
  const run = () => {
    void Promise.resolve()
      .then(task)
      .catch((err) => {
        logger.error({ err, label }, "[ApiKey] 后台任务失败");
      });
  };
  try {
    after(run);
  } catch (err) {
    // audit-allow: 非 Next 请求作用域（单测里直接调用 app.request）时 after() 必然抛错，
    //   这是预期分支；退化为即时异步执行，与 after() 一样不阻塞本次请求。
    logger.debug({ err, label }, "[ApiKey] after() 不可用，退化为即时异步执行");
    run();
    return;
  }
}

function readBearerToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * 解析并校验 API Key。
 * 返回 null 表示"没有可用的 key"（缺失 / 无效 / 已停用），由 requireScope 决定状态码。
 */
export async function resolveApiKey(
  c: Context,
): Promise<ResolvedApiKey | null> {
  const token = readBearerToken(c);
  if (!token) return null;

  const row = await drizzleDb.query.api_keys.findFirst({
    where: eq(drizzleSchema.api_keys.key_string, token),
    columns: {
      id: true,
      user_id: true,
      scopes: true,
      is_active: true,
    },
  });

  if (!row || row.is_active !== 1) return null;

  scheduleBackground(async () => {
    await drizzleDb
      .update(drizzleSchema.api_keys)
      .set({ last_used_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(drizzleSchema.api_keys.id, row.id));
  }, `更新 key ${row.id} 的 last_used_at`);

  const scope = normalizeScope(row.scopes);
  const isGlobal = row.user_id === null || row.user_id === undefined;

  return {
    keyId: row.id,
    userId: isGlobal ? null : row.user_id,
    effectiveUserId: isGlobal ? resolveGlobalUserId() : (row.user_id as number),
    scope,
    isGlobal,
  };
}

/**
 * 校验作用域。成功时把身份挂到 Context 上并返回解析结果；
 * 失败时直接返回 Response（401 / 403），调用方原样 return 即可。
 */
export async function requireScope(
  c: Context,
  required: ApiScope,
): Promise<ResolvedApiKey | Response> {
  const token = readBearerToken(c);
  if (!token) {
    return c.json({ error: "缺少 Authorization: Bearer <key>" }, 401);
  }

  let identity: ResolvedApiKey | null;
  try {
    identity = await resolveApiKey(c);
  } catch (err) {
    logger.error({ err }, "[ApiKey] 鉴权查询失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }

  if (!identity) {
    return c.json({ error: "API Key 无效或已停用" }, 401);
  }

  if (!scopeSatisfies(identity.scope, required)) {
    // 先登记身份再返回 403：越权尝试同样要能追溯到"是哪把 key 试的"
    identityStore.set(c, identity);
    return c.json({ error: `该 key 的作用域不足（需要 ${required}）` }, 403);
  }

  identityStore.set(c, identity);
  return identity;
}
