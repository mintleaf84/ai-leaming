/**
 * `/api/external` 的公共设施：限流、鉴权包装、预演开关、分页 schema 与常用解析器。
 *
 * 拆分自 `routes/external.ts`（3242 行）；这里只搬移，行为未变。
 */
import { z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import {
  requireScope,
  getApiKeyIdentity,
  type ApiScope,
  type ResolvedApiKey,
} from "@/lib/api/middlewares/api-key";
import { checkRateLimitWith } from "@/lib/auth/rate-limit";

// ==================== 限流 ====================
/**
 * 外部接口按 **API Key** 计流，不按 IP：agent 通常共用同一个出口 IP，
 * 按 IP 计会把"一个调用方跑飞"放大成"所有人一起 429"。
 *
 * 单测会临时下调这两个值来验证 429（见 external-ratelimit.test.ts），
 * 因此必须保持可写对象；生产不改。
 */
export const externalRateLimits = {
  /** 只读：agent 轮询题库/队列的正常量级远低于此 */
  read: { limit: 600, windowMs: 60_000 },
  /** 写入：留出重试重发余量，同时挡住"重试风暴" */
  write: { limit: 120, windowMs: 60_000 },
};

/** 全局限流中间件：按 API Key 计入读/写两个桶（index.ts 挂到 `app.use("*")`）。 */
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("Authorization");
  const token = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "")?.[1]?.trim();
  // 用 token 的哈希做 key：内存里不留明文密钥，同一把 key 必然落同一个桶
  const identifier = token
    ? `key:${createHash("sha256").update(token).digest("hex").slice(0, 24)}`
    : `ip:${c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown"}`;

  // HEAD 走的是 GET 处理器（Next.js 把 HEAD 交给 GET export），按写配额计会
  // 让一个探活请求吃掉写额度，所以两者都归读桶
  const bucket =
    c.req.method === "GET" || c.req.method === "HEAD" ? "read" : "write";
  const result = checkRateLimitWith(
    identifier,
    `external:${bucket}`,
    externalRateLimits[bucket],
  );

  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(result.resetTime / 1000)));

  if (!result.success) {
    const retryAfter = Math.max(
      1,
      Math.ceil((result.resetTime - Date.now()) / 1000),
    );
    c.header("Retry-After", String(retryAfter));
    // retryAfter 同时给在 body 里：agent 不解析响应头也能退避
    return c.json(
      { error: `请求过于频繁：请 ${retryAfter} 秒后重试`, retryAfter },
      429,
    );
  }

  await next();
};

/** 单个路由额外要求更高作用域（全局 read 守卫是兜底，不是上限） */
function requireScopeMiddleware(required: ApiScope) {
  return async (
    c: Parameters<typeof requireScope>[0],
    next: () => Promise<void>,
  ) => {
    const identity = await requireScope(c, required);
    if (identity instanceof Response) return identity;
    await next();
  };
}

/**
 * 写接口统一的预演开关。
 *
 * 用 query 而不是 body 字段：`DELETE /recall/decks/{deckKey}/cards/{cardKey}` 没有
 * body，用 query 五个写接口才能保持同一种用法（agent 不必记两套）。
 */
const DryRunQuerySchema = z.object({
  dryRun: z.enum(["true", "false"]).optional().openapi({
    description:
      'true = 预演：走完真实校验与计算后回滚，返回"如果真执行会怎样"，库内零变更',
    example: "true",
  }),
});

/**
 * body 与 query 都算了一遍的兼容开销？
 * 这里只认 query（`?dryRun=true`），不做 body 字段的隐式识别 ——
 * 两个入口意味着两套文档与两种测试，收益却为零。
 */
function wantsDryRun(query: { dryRun?: "true" | "false" }): boolean {
  return query.dryRun === "true";
}

/** zod 的 issue → 稳定的字符串数组（契约里 issues 是 string[]，不是内部结构） */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path || "body"}: ${issue.message}`;
  });
}

/**
 * 429 的统一声明。
 *
 * 中间件实际返回的是 `{ error, retryAfter }` + `Retry-After` /
 * `X-RateLimit-*` 头。只在各路由写一句 description，生成的客户端拿不到字段类型，
 * 也没法按头退避（评审指出过这一点），所以收敛成一份可复用的响应定义。
 */
const RateLimitedResponse = {
  description:
    "请求过于频繁 - 超过该 API Key 的限额；按 Retry-After 头或 body.retryAfter 退避后重试",
  headers: z.object({
    "Retry-After": z.string().describe("建议等待的秒数"),
    "X-RateLimit-Limit": z.string().describe("该桶的额度"),
    "X-RateLimit-Remaining": z.string().describe("剩余额度（超限时为 0）"),
    "X-RateLimit-Reset": z.string().describe("窗口重置时间（Unix 秒）"),
  }),
  content: {
    "application/json": {
      schema: z.object({
        error: z.string().describe("可读错误信息"),
        retryAfter: z
          .number()
          .int()
          .describe("建议等待的秒数，与 Retry-After 头一致"),
      }),
    },
  },
};

/** 分页上限与默认值（统一口径：默认 20，上限 100） */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PaginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default(String(DEFAULT_LIMIT))
    .describe(`返回条数，默认 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}`),
  offset: z.string().optional().default("0").describe("偏移量，默认 0"),
});

const PaginationMetaSchema = z.object({
  limit: z
    .number()
    .int()
    .describe("本次请求的实际条数上限（已被截到 100 以内）"),
  offset: z.number().int().describe("本次请求的偏移量"),
  total: z.number().int().describe("符合条件的总条数"),
});

/**
 * 取鉴权中间件已解析的身份。
 * 中间件挂在 app.use("*") 上，缺失即代码错误（不是用户输入问题），直接抛 500。
 */
function requireIdentity(c: Context): ResolvedApiKey {
  const identity = getApiKeyIdentity(c);
  if (!identity) {
    throw new Error("[ExternalAPI] 鉴权中间件未提供调用身份");
  }
  return identity;
}

/** 路径里的数字卡片主键；非法值返回 null（由路由回 400） */
function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// ---------- 对外暴露的公共设施（供各资源子模块与 index.ts 使用） ----------
export {
  requireScopeMiddleware,
  DryRunQuerySchema,
  wantsDryRun,
  formatIssues,
  RateLimitedResponse,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PaginationQuerySchema,
  PaginationMetaSchema,
  requireIdentity,
  parsePositiveInt,
};
