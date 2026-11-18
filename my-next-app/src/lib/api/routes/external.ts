import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { safeParseJson } from "@/lib/utils/json";
import {
  requireScope,
  getApiKeyIdentity,
  type ApiScope,
  type ResolvedApiKey,
} from "@/lib/api/middlewares/api-key";
import { apiAuditForWrites } from "@/lib/api/audit";
import type { Context } from "hono";
import { historyService } from "@/lib/services/history";
import { wrongQuestionService } from "@/lib/services/wrong-question";
import { masteryService } from "@/lib/services/mastery";
import { statsService } from "@/lib/services/stats";
import {
  getAllKnowledgeCards,
  countKnowledgeCards,
} from "@/lib/services/knowledge";
import {
  importService,
  InvalidQuestionIdsError,
  type AgentAnswersImportInput,
} from "@/lib/services/import-service";
import {
  archiveCard,
  buildNextReviewText,
  computeStreakDays,
  findCard,
  getTodayQueue,
  listDeckCards,
  normalizeItemIndexes,
  submitReview,
  unarchiveCard,
} from "@/lib/services/recall";
import {
  deleteCard,
  importDeck,
  listDecks,
  upsertCard,
} from "@/lib/services/recall-import";
import { logger } from "@/lib/logger";
import { knowledgeService } from "@/lib/services/knowledge";
import { QuestionSchema } from "@/lib/schemas";
import { buildApiExternalId } from "@/lib/services/question-idempotency";
import { indexQuestion } from "@/lib/services/question-vector-index";
import { touchesEmbeddingText } from "@/lib/services/question-index-policy";
import { withKeyedLock } from "@/lib/services/keyed-lock";
import { withTransaction } from "@/lib/db/executor";
import { mindmapService } from "@/lib/services/mindmap";
import { srsService, summarizeFutureReviews } from "@/lib/services/srs";
import { toErrorResponse } from "@/lib/api/error-response";
import { createHash } from "node:crypto";
import { checkRateLimitWith } from "@/lib/auth/rate-limit";

const app = new OpenAPIHono();

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

app.use("*", async (c, next) => {
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
});

// ==================== 鉴权 / 审计中间件 ====================
// 审计先挂：这样未通过鉴权的写请求（401/403）也会留痕。
// 身份（key/user/scope）由 requireScope 解析并挂到 Context 上，审计中间件随后读取。

app.use("*", apiAuditForWrites());

app.use("*", async (c, next) => {
  const identity = await requireScope(c, "read");
  if (identity instanceof Response) return identity;
  await next();
});

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

// ==================== Schema 定义 ====================

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

const ExternalQuestionSchema = z.object({
  id: z.number(),
  type: z.string().nullable().optional(),
  dimension: z.string().nullable().optional(),
  content: z.string(),
  options: z.array(z.string()),
  answer: z.string(),
  explanation: z.string().nullable().optional(),
  tags: z.array(z.string()),
});

const ExternalQuestionListSchema = z.object({
  data: z.array(ExternalQuestionSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ==================== 路由：获取题库列表 ====================

const listRoute = createRoute({
  method: "get",
  path: "/questions",
  request: {
    query: z.object({
      page: z.string().optional().default("1"),
      limit: z.string().optional().default("20"),
      tag: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ExternalQuestionListSchema },
      },
      description: "获取题库列表（分页）",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(listRoute, async (c) => {
  const { page, limit, tag } = c.req.valid("query");
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // 限制最大 100
  const offset = (pageNum - 1) * limitNum;

  const whereClause = tag
    ? sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})`
    : undefined;

  const [totalRow] = await drizzleDb
    .select({ value: count() })
    .from(drizzleSchema.questions)
    .where(whereClause);

  const rows = await drizzleDb
    .select({
      id: drizzleSchema.questions.id,
      type: drizzleSchema.questions.type,
      dimension: drizzleSchema.questions.dimension,
      content: drizzleSchema.questions.content,
      options: drizzleSchema.questions.options,
      answer: drizzleSchema.questions.answer,
      explanation: drizzleSchema.questions.explanation,
      tags: drizzleSchema.questions.tags,
    })
    .from(drizzleSchema.questions)
    .where(whereClause)
    .orderBy(drizzleSchema.questions.id)
    .limit(limitNum)
    .offset(offset)
    .all();

  // 反序列化 JSON 字符串字段
  const data = rows.map((row) => ({
    id: row.id,
    type: row.type || null,
    dimension: (row.dimension as string) || null,
    content: row.content,
    options: safeParseJson(row.options as string | null | undefined, []),
    answer: row.answer || "",
    explanation: row.explanation || null,
    tags: safeParseJson(row.tags as string | null | undefined, []),
  }));

  return c.json({
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalRow.value,
      totalPages: Math.ceil(totalRow.value / limitNum),
    },
  });
});

// ==================== 路由：获取单道题目详情 ====================

const getRoute = createRoute({
  method: "get",
  path: "/questions/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ExternalQuestionSchema },
      },
      description: "获取单道题目详情",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "题目不存在" },
    429: RateLimitedResponse,
  },
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");

  // 与 PATCH 共用同一套解析：`parseInt("1e1")` 会得到 1，而 `Number("1e1")` 是 10，
  // 同一路径两套规则会让"读到的题"和"改到的题"不是同一道（评审指出过）
  const questionId = parsePositiveInt(id);
  if (questionId === null) {
    return c.json({ error: "题目 ID 必须是正整数" }, 400);
  }

  const row = await drizzleDb.query.questions.findFirst({
    where: eq(drizzleSchema.questions.id, questionId),
  });

  if (!row) {
    return c.json({ error: "题目不存在" }, 404);
  }

  return c.json({
    id: row.id,
    type: row.type || null,
    dimension: (row.dimension as string) || null,
    content: row.content,
    options: safeParseJson(row.options as string | null | undefined, []),
    answer: row.answer || "",
    explanation: row.explanation || null,
    tags: safeParseJson(row.tags as string | null | undefined, []),
  });
});

// ==================== 只读接口：用户练习数据 ====================
// 数据隔离：所有查询都以 identity.effectiveUserId 过滤，用户 key 只能看到自己的数据；
// 全局 key（user_id = NULL）解析为 API_GLOBAL_USER_ID，等价于站长身份。
// 访问他人资源统一返回 404，不区分"不存在"与"无权访问"，避免泄露存在性。

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

const SessionSummarySchema = z.object({
  totalQuestions: z.number().int().describe("本场题目数"),
  correctCount: z.number().int().describe("本场答对数"),
  accuracy: z.number().int().describe("本场正确率（0-100 整数百分比）"),
  // 实现里一直返回这个字段，schema 漏了会让 agent 自生成代码看不到它
  totalDurationMs: z.number().int().describe("本场累计耗时（毫秒）"),
});

const SessionListItemSchema = z.object({
  id: z.string().describe("会话 ID"),
  name: z.string().nullable().describe("会话名称，未命名为 null"),
  mode: z.string().nullable().describe("练习模式，未知为 null"),
  totalQuestions: z.number().int().describe("题目数"),
  correctCount: z.number().int().describe("答对数"),
  accuracy: z.number().int().describe("正确率（0-100 整数百分比）"),
  startedAt: z
    .string()
    .describe("开始时间（ISO 8601 UTC，由 service 层用 dayjs 统一格式化）"),
});

/** 解析 limit/offset 字符串参数：非法值退回默认，limit 截到 [1, 100] */
function parsePagination(query: { limit?: string; offset?: string }): {
  limit: number;
  offset: number;
} {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.trunc(rawOffset))
    : 0;
  return { limit, offset };
}

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

/** 会话列表项 → 对外结构（不含 user_id 等内部字段） */
function toSessionListItem(item: {
  id: string;
  sessionName?: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  createdAt: string;
  practiceMode?: string;
}): z.infer<typeof SessionListItemSchema> {
  return {
    id: item.id,
    name: item.sessionName ?? null,
    mode: item.practiceMode ?? null,
    totalQuestions: item.totalQuestions,
    correctCount: item.correctCount,
    accuracy: item.accuracy,
    startedAt: item.createdAt,
  };
}

// ---------- GET /practice/sessions ----------

const listSessionsQuery = PaginationQuerySchema.extend({
  mode: z.string().optional().describe("按练习模式筛选，不传返回全部"),
});

const listSessionsRoute = createRoute({
  method: "get",
  path: "/practice/sessions",
  summary: "列出当前调用身份的练习会话",
  description:
    "只读接口，需 read 作用域。返回当前 API Key 所属用户的练习会话（按开始时间倒序），含题目数、答对数与正确率。用户 key 只能看到自己的会话；全局 key 看到 API_GLOBAL_USER_ID 对应用户的数据。",
  request: { query: listSessionsQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(SessionListItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "会话列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(listSessionsRoute, async (c) => {
  const identity = requireIdentity(c);
  const query = c.req.valid("query");
  const { limit, offset } = parsePagination(query);

  const { items, total } = await historyService.listSessions(
    identity.effectiveUserId,
    { limit, offset, mode: query.mode },
  );

  return c.json({
    data: items.map(toSessionListItem),
    meta: { limit, offset, total },
  });
});

// ---------- GET /practice/sessions/:id ----------

const sessionDetailRoute = createRoute({
  method: "get",
  path: "/practice/sessions/{id}",
  summary: "获取单场练习详情与逐题作答记录",
  description:
    "只读接口，需 read 作用域。返回会话元信息、逐题作答记录（题目内容、选项、用户答案、是否正确、耗时）与汇总。会话不属于当前调用身份时返回 404（不区分不存在与无权访问）。",
  request: {
    params: z.object({ id: z.string().describe("练习会话 ID") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            session: SessionListItemSchema,
            questions: z.array(
              z.object({
                questionId: z.number().int().describe("题目 ID"),
                content: z.string().describe("题干"),
                options: z.array(z.string()).describe("选项"),
                userAnswer: z.string().describe("用户答案"),
                correctAnswer: z.string().describe("正确答案"),
                isCorrect: z.boolean().describe("是否答对"),
                durationMs: z.number().int().describe("本题耗时（毫秒）"),
                tags: z.array(z.string()).describe("标签"),
              }),
            ),
            summary: SessionSummarySchema,
          }),
        },
      },
      description: "会话详情",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    404: { description: "会话不存在或不属于当前调用身份" },
  },
});

app.openapi(sessionDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { id } = c.req.valid("param");

  const detail = await historyService.getSessionDetail(
    identity.effectiveUserId,
    id,
  );

  if (!detail) {
    return c.json({ error: "练习会话不存在" }, 404);
  }

  const questions = detail.logs.map((log) => ({
    questionId: log.questionId,
    content: log.questionContent,
    options: log.options,
    userAnswer: log.userAnswer,
    correctAnswer: log.correctAnswer,
    isCorrect: log.isCorrect,
    durationMs: log.duration,
    tags: log.tags,
  }));

  const totalDurationMs = questions.reduce(
    (sum, question) => sum + (question.durationMs || 0),
    0,
  );

  return c.json({
    session: toSessionListItem(detail.session),
    questions,
    summary: {
      totalQuestions: detail.session.totalQuestions,
      correctCount: detail.session.correctCount,
      accuracy: detail.session.accuracy,
      totalDurationMs,
    },
  });
});

// ---------- GET /wrong-book ----------

const WrongBookItemSchema = z.object({
  questionId: z.number().int().describe("题目 ID"),
  content: z.string().describe("题干"),
  tags: z.array(z.string()).describe("标签"),
  wrongCount: z.number().int().describe("累计答错次数"),
  lastWrongAt: z.string().describe("最近一次答错时间"),
  srs: z
    .object({
      stability: z.number().describe("SRS 记忆稳定度"),
      difficulty: z.number().describe("SRS 难度"),
      dueDate: z.string().describe("SRS 下次复习时间"),
    })
    .nullable()
    .describe("SRS 状态，尚未进入复习队列时为 null"),
});

const wrongBookQuery = PaginationQuerySchema.extend({
  tag: z.string().optional().describe("按标签筛选，不传返回全部错题"),
});

const wrongBookRoute = createRoute({
  method: "get",
  path: "/wrong-book",
  summary: "列出当前用户的错题（可按标签筛选）",
  description:
    "只读接口，需 read 作用域。返回当前 API Key 所属用户尚未标记为已掌握的错题，按错误次数与最近错误时间倒序。跨用户数据不可见。",
  request: { query: wrongBookQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(WrongBookItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "错题列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(wrongBookRoute, async (c) => {
  const identity = requireIdentity(c);
  const query = c.req.valid("query");
  const { limit, offset } = parsePagination(query);

  const { questions, total } = await wrongQuestionService.getList(
    identity.effectiveUserId,
    { limit, offset, tag: query.tag },
  );

  return c.json({
    data: questions.map((item) => ({
      questionId: item.questionId,
      content: item.questionContent,
      tags: item.tags,
      wrongCount: item.wrongCount,
      lastWrongAt: item.lastWrongAt,
      srs: item.srs
        ? {
            stability: item.srs.stability,
            difficulty: item.srs.difficulty,
            dueDate: item.srs.due_date,
          }
        : null,
    })),
    meta: { limit, offset, total },
  });
});

// ---------- GET /wrong-book/stats ----------

const wrongBookStatsRoute = createRoute({
  method: "get",
  path: "/wrong-book/stats",
  summary: "错题统计（总数 / 按标签 / 按维度）",
  description:
    "只读接口，需 read 作用域。统计当前 API Key 所属用户的错题：去重后的错题总数、按标签分布、按题目维度（knowledge / understanding / application）分布。口径与错题列表一致（排除已掌握题目）。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            total: z.number().int().describe("去重后的错题总数"),
            byTag: z.array(
              z.object({
                tag: z.string().describe("标签"),
                count: z.number().int().describe("该标签下的错题数"),
              }),
            ),
            byDimension: z.array(
              z.object({
                dimension: z.string().describe("题目维度，缺失时为 unknown"),
                count: z.number().int().describe("该维度下的错题数"),
              }),
            ),
          }),
        },
      },
      description: "错题统计",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(wrongBookStatsRoute, async (c) => {
  const identity = requireIdentity(c);
  const stats = await wrongQuestionService.getDistribution(
    identity.effectiveUserId,
  );
  return c.json(stats);
});

// ---------- GET /mastery ----------

const masteryRoute = createRoute({
  method: "get",
  path: "/mastery",
  summary: "按标签的掌握度（分数 / 正确率 / 作答次数）",
  description:
    "只读接口，需 read 作用域。返回当前 API Key 所属用户在每个标签上的掌握度分数（0-100）、正确率与累计作答次数，按标签名升序分页。跨用户数据不可见。",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                tag: z.string().describe("标签（知识点路径）"),
                score: z.number().describe("掌握度分数（0-100）"),
                correctCount: z.number().int().describe("累计答对数"),
                totalCount: z.number().int().describe("累计作答次数"),
                accuracy: z
                  .number()
                  .int()
                  .describe("正确率（0-100 整数百分比）"),
                lastUpdated: z
                  .string()
                  .nullable()
                  .describe("最近更新时间，未知为 null"),
              }),
            ),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "掌握度列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(masteryRoute, async (c) => {
  const identity = requireIdentity(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const { items, total } = await masteryService.getMasteryEntries(
    identity.effectiveUserId,
    { limit, offset },
  );

  return c.json({
    data: items,
    meta: { limit, offset, total },
  });
});

// ---------- GET /stats ----------

const overviewRoute = createRoute({
  method: "get",
  path: "/stats",
  summary: "学习总览（作答量 / 正确率 / 连续天数）",
  description:
    "只读接口，需 read 作用域。返回当前 API Key 所属用户的学习总览：累计作答数、答对数、正确率、会话数、连续学习天数、平均掌握度、薄弱知识点等。正确率与平均掌握度均为 0-100 的整数百分比。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            totalAnswered: z.number().int().describe("累计作答次数（题次）"),
            totalCorrect: z.number().int().describe("累计答对数"),
            accuracy: z.number().int().describe("累计正确率（0-100）"),
            totalSessions: z.number().int().describe("累计练习会话数"),
            streakDays: z.number().int().describe("连续学习天数"),
            averageMastery: z.number().int().describe("平均掌握度（0-100）"),
            todayAnswered: z.number().int().describe("今日作答次数"),
            todayCorrect: z.number().int().describe("今日答对数"),
            pendingReviewCount: z
              .number()
              .int()
              .describe("待复习错题数（最近 7 天答错去重）"),
            observationZoneCount: z.number().int().describe("观察区知识点数"),
            weakPoints: z.array(
              z.object({
                tag: z.string().describe("知识点标签"),
                score: z.number().describe("掌握度分数（0-100）"),
              }),
            ),
          }),
        },
      },
      description: "学习总览",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(overviewRoute, async (c) => {
  const identity = requireIdentity(c);
  const stats = await statsService.getUserStats(identity.effectiveUserId);

  return c.json({
    totalAnswered: stats.totalPracticed,
    totalCorrect: stats.totalCorrect,
    accuracy:
      stats.totalPracticed > 0
        ? Math.round((stats.totalCorrect / stats.totalPracticed) * 100)
        : 0,
    totalSessions: stats.totalSessions,
    streakDays: stats.streakDays,
    averageMastery: stats.averageMastery,
    todayAnswered: stats.todayPracticed,
    todayCorrect: stats.todayCorrect,
    pendingReviewCount: stats.pendingReviewCount,
    observationZoneCount: stats.observationZoneCount,
    weakPoints: stats.weakPoints,
  });
});

// ---------- GET /knowledge/cards ----------

const knowledgeCardsQuery = PaginationQuerySchema.extend({
  category: z.string().optional().describe("按分类筛选，不传返回全部分类"),
});

const knowledgeCardsRoute = createRoute({
  method: "get",
  path: "/knowledge/cards",
  summary: "列出当前用户的知识卡片",
  description:
    "只读接口，需 read 作用域。返回当前 API Key 所属用户的知识卡片（问答对 + 要点），按创建时间倒序分页，可按分类筛选。跨用户数据不可见。",
  request: { query: knowledgeCardsQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.number().int().describe("卡片 ID"),
                title: z.string().describe("标题"),
                category: z.string().describe("分类，缺失时为空字符串"),
                tags: z.array(z.string()).describe("标签"),
                front: z.string().describe("卡片正面（问题）"),
                back: z.string().describe("卡片背面（答案）"),
                keyPoints: z
                  .array(
                    z.object({
                      term: z.string().describe("术语"),
                      definition: z.string().describe("释义"),
                    }),
                  )
                  .describe("要点"),
                createdAt: z.string().nullable().describe("创建时间"),
              }),
            ),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "知识卡片列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(knowledgeCardsRoute, async (c) => {
  const identity = requireIdentity(c);
  const query = c.req.valid("query");
  const { limit, offset } = parsePagination(query);
  const userId = identity.effectiveUserId;

  const [cards, total] = await Promise.all([
    getAllKnowledgeCards(query.category, limit, undefined, userId, offset),
    countKnowledgeCards(userId, query.category),
  ]);

  return c.json({
    data: cards.map((card) => ({
      id: card.id ?? 0,
      title: card.title,
      category: card.category ?? "",
      tags: card.tags,
      front: card.front,
      back: card.back,
      keyPoints: card.key_points,
      createdAt: card.created_at ?? null,
    })),
    meta: { limit, offset, total },
  });
});

// ==================== 路由：agent 导入答题记录（写，需 write 作用域） ====================
// 与上面的只读接口共用 /api/external 前缀，但这是本文件唯一的写接口：
// 作用域要求提升到 write，幂等由调用方提供的 sessionKey 保证。

const AgentAnswerSchema = z
  .object({
    questionId: z.number().int().positive().openapi({
      description: "题目 ID，必须是题库中存在的题目；不存在则整批拒绝（400）",
      example: 123,
    }),
    userAnswer: z.string().nullable().optional().openapi({
      description: '用户作答内容（选择题如 "A"，填空题可为原文或空）',
      example: "A",
    }),
    isCorrect: z.boolean().openapi({
      description:
        "本题是否正确，由调用方（agent）判定后传入；服务端不会用标准答案重算",
      example: true,
    }),
    durationMs: z.number().int().min(0).nullable().optional().openapi({
      description: "本题作答耗时（毫秒），可省略",
      example: 12000,
    }),
  })
  .openapi("ExternalAgentAnswer");

const AgentAnswersRequestSchema = z
  .object({
    sessionKey: z.string().min(1).max(200).openapi({
      description:
        "幂等键，由调用方生成并跨重试保持不变；同一用户的同一 sessionKey 重复提交只会算一次",
      example: "agent-run-2026-11-13-a",
    }),
    sessionName: z.string().max(200).optional().openapi({
      description: "会话名称，省略时记为「由 agent 导入」",
      example: "由 agent 导入",
    }),
    answers: z.array(AgentAnswerSchema).min(1).max(500).openapi({
      description: "答题记录，1..500 条",
    }),
  })
  .openapi("ExternalAgentAnswersRequest");

const AgentAnswersResponseSchema = z
  .object({
    sessionId: z
      .string()
      .openapi({ description: "写入（或幂等命中）的会话 ID" }),
    inserted: z
      .number()
      .int()
      .openapi({ description: "本次写入的答题记录条数；幂等命中时为 0" }),
    duplicated: z.boolean().openapi({
      description: "true 表示该 sessionKey 已导入过，本次未产生任何新数据",
    }),
    dryRun: z.boolean().optional().openapi({
      description:
        '仅预演时出现且恒为 true：本次没有写库，计数是"真执行会写入多少"',
    }),
  })
  .openapi("ExternalAgentAnswersResponse");

const importAnswersRoute = createRoute({
  method: "post",
  path: "/practice/answers",
  middleware: [requireScopeMiddleware("write")] as const,
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则 @hono/zod-openapi 会把缺失的 body 校验成 `{}`，
      // 请求一路走到 service 层才炸成 500
      required: true,
      content: {
        "application/json": { schema: AgentAnswersRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: AgentAnswersResponseSchema },
      },
      description: "导入成功（或幂等命中，见 duplicated 字段）",
    },
    400: { description: "请求体校验失败 / 存在题库中不存在的 questionId" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(importAnswersRoute, async (c) => {
  // 与只读接口保持同一形态：身份缺失说明中间件没生效，属代码错误（500），
  // 而不是"用户没登录"（那是 401，已由 requireScope 拦截）
  const identity = requireIdentity(c);
  const body = c.req.valid("json") as AgentAnswersImportInput;
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const result = await importService.importAgentAnswers(
      identity.effectiveUserId,
      body,
      { dryRun },
    );
    return c.json(result, 200);
  } catch (err) {
    // 命中明确业务错误：题目不存在 → 400，并把非法 ID 回给调用方（前 5 个）
    if (err instanceof InvalidQuestionIdsError) {
      return c.json(
        {
          // message 里也带全部非法 id，这里一并截断，避免 400 响应比实际需要大
          error:
            err.invalidQuestionIds.length > 5
              ? `以下 questionId 不存在：${err.invalidQuestionIds.slice(0, 5).join(", ")} …（共 ${err.invalidQuestionIds.length} 个）`
              : err.message,
          invalidQuestionIds: err.invalidQuestionIds.slice(0, 5),
        },
        400,
      );
    }
    // 其余是真实故障：记结构化日志后按 500 返回，不把内部细节透出去
    logger.error({ err }, "[External] 导入 agent 答题记录失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ==================== 回忆自测（Recall） ====================
// 卡组与卡片内容**全局共享**（`recall_decks` / `recall_cards` 没有 user_id），
// 复习进度与日志按调用身份隔离（`recall_card_states` / `recall_review_logs`）。
// 判分、调度、幂等全部在 `lib/services/recall*.ts`：这里只做参数校验、身份透传
// 与错误语义映射，任何判分逻辑都不允许在路由层再写一遍（否则两处必然漂移）。

const RecallCardKindSchema = z
  .enum(["list", "cloze"])
  .describe("卡片类型：list = 列举卡，cloze = 填空卡");

const RecallListItemSchema = z.object({
  text: z.string().describe("条目文本"),
  keywords: z.array(z.string()).describe("关键词，任一命中即判「已写」"),
});

const RecallBlankSchema = z.object({
  answers: z.array(z.string()).describe("该空可接受的答案（1–3 个）"),
});

const RecallCardStateSchema = z
  .object({
    due: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    stability: z.number().describe("FSRS 记忆稳定度"),
    difficulty: z.number().describe("FSRS 难度"),
    state: z
      .number()
      .int()
      .describe("FSRS 状态：0 New / 1 Learning / 2 Review / 3 Relearning"),
    reps: z.number().int().describe("累计复习次数"),
    lapses: z.number().int().describe("累计遗忘次数"),
    last_review: z
      .string()
      .nullable()
      .describe("最近一次复习时间，未知为 null"),
    pendingItems: z
      .array(z.number().int())
      .nullable()
      .describe("待重测的条目下标；null 表示没有待重测条目"),
    archived: z.boolean().describe("是否已归档（移出队列）"),
  })
  .nullable()
  .describe("该调用身份在这张卡上的进度；null = 从未复习过（新卡）");

const RecallCardSchema = z.object({
  cardId: z.number().int().describe("卡片数字主键（提交作答时用它）"),
  cardKey: z.string().describe("卡片文件内标识（卡组内唯一）"),
  kind: RecallCardKindSchema,
  groupKey: z.string().nullable().describe("所属分组，未分组为 null"),
  prompt: z.string().describe("题干"),
  items: z
    .array(RecallListItemSchema)
    .nullable()
    .describe("列举卡条目；填空卡为 null"),
  blanks: z
    .array(RecallBlankSchema)
    .nullable()
    .describe("填空卡空位；列举卡为 null"),
  verbatim: z.boolean().describe("是否逐字判分（仅列举卡有意义）"),
  state: RecallCardStateSchema,
});

/** 路径里的数字卡片主键；非法值返回 null（由路由回 400） */
function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// ---------- GET /recall/decks ----------

const recallDecksRoute = createRoute({
  method: "get",
  path: "/recall/decks",
  summary: "列出回忆自测卡组（含当前身份的进度统计）",
  description:
    "只读接口，需 read 作用域。卡组内容全局共享，`activeCount` / `archivedCount` / `dueCount` 只统计当前 API Key 所属用户的数据。按卡组标题升序。",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                deckKey: z
                  .string()
                  .describe("卡组标识（导入导出文件里的 deckId）"),
                title: z.string().describe("卡组标题"),
                cardCount: z.number().int().describe("卡组内卡片总数"),
                activeCount: z
                  .number()
                  .int()
                  .describe("该用户未归档、已有复习状态的卡片数（含未到期）"),
                archivedCount: z
                  .number()
                  .int()
                  .describe("该用户已归档（移出队列）的卡片数"),
                dueCount: z
                  .number()
                  .int()
                  .describe("该用户当前到期可复习的卡片数"),
              }),
            ),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "卡组列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(recallDecksRoute, async (c) => {
  const identity = requireIdentity(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const decks = await listDecks(identity.effectiveUserId);
  // listDecks 一次查全部卡组（数量级是「几十个」），分页在内存里切片即可，
  // 不必为了外部 API 改动服务层签名（Server Action 也走同一个函数）。
  const page = decks.slice(offset, offset + limit).map((deck) => ({
    deckKey: deck.deckKey,
    title: deck.title,
    cardCount: deck.cardCount,
    activeCount: deck.activeCount,
    archivedCount: deck.archivedCount,
    dueCount: deck.dueCount,
  }));

  return c.json({ data: page, meta: { limit, offset, total: decks.length } });
});

// ---------- GET /recall/decks/:deckKey ----------

const recallDeckDetailRoute = createRoute({
  method: "get",
  path: "/recall/decks/{deckKey}",
  summary: "获取卡组详情与卡片列表（含当前身份的复习状态）",
  description:
    "只读接口，需 read 作用域。卡片内容全局共享，`state` 只反映当前 API Key 所属用户的进度（无记录为 null）。按卡片主键升序分页，默认 20、上限 100。卡组不存在返回 404。",
  request: {
    params: z.object({ deckKey: z.string().describe("卡组标识") }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            deck: z.object({
              deckKey: z.string(),
              title: z.string(),
              groups: z.array(
                z.object({
                  groupId: z.string(),
                  title: z.string(),
                  order: z.number().int().optional(),
                }),
              ),
            }),
            data: z.array(RecallCardSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "卡组详情 + 卡片列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在" },
  },
});

app.openapi(recallDeckDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { deckKey } = c.req.valid("param");
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const page = await listDeckCards(identity.effectiveUserId, deckKey, {
    limit,
    offset,
  });
  if (!page) {
    return c.json({ error: `卡组不存在：${deckKey}` }, 404);
  }

  return c.json({
    deck: page.deck,
    data: page.cards.map((card) => ({
      cardId: card.cardId,
      cardKey: card.cardKey,
      kind: card.kind,
      groupKey: card.groupKey,
      prompt: card.prompt,
      items: card.items,
      blanks: card.blanks,
      verbatim: card.verbatim,
      state: card.state,
    })),
    meta: { limit, offset, total: page.total },
  });
});

// ---------- GET /recall/cards/:cardId ----------

const recallCardDetailRoute = createRoute({
  method: "get",
  path: "/recall/cards/{cardId}",
  summary: "获取单张回忆卡详情（含呈现模式与待重测条目）",
  description:
    "只读接口，需 read 作用域。`cardId` 是数字主键。`mode` 为 `retest` 时界面只呈现 `pendingItems` 里的条目；`state` 为 null 表示该身份从未复习过这张卡。卡片不存在返回 404。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            cardKey: z.string(),
            deckKey: z.string(),
            deckTitle: z.string(),
            kind: RecallCardKindSchema,
            groupKey: z.string().nullable(),
            prompt: z.string(),
            items: z.array(RecallListItemSchema).nullable(),
            blanks: z.array(RecallBlankSchema).nullable(),
            verbatim: z.boolean(),
            state: RecallCardStateSchema,
            mode: z
              .enum(["first", "retest"])
              .describe("first = 首次作答整卡；retest = 只重测待重测条目"),
            pendingItems: z
              .array(z.number().int())
              .nullable()
              .describe("待重测条目下标；null 表示没有（与 mode 联动）"),
          }),
        },
      },
      description: "卡片详情",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    404: { description: "卡片不存在" },
  },
});

app.openapi(recallCardDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const cardId = parsePositiveInt(c.req.valid("param").cardId);
  if (cardId === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  const card = await findCard(identity.effectiveUserId, cardId);
  if (!card) {
    return c.json({ error: `卡片不存在：${cardId}` }, 404);
  }

  // 条目可能因编辑而变少：先按**当前**条目数过滤库里的 pendingItems，
  // 过滤后为空就退回首发。否则会把模式判成 retest 并返回不存在的条目下标，
  // 客户端照着取条目会扑空（清洗逻辑复用服务层的 normalizeItemIndexes）。
  const itemCount =
    card.kind === "list"
      ? (card.items ?? []).length
      : (card.blanks ?? []).length;
  const pendingItems = normalizeItemIndexes(
    card.state?.pendingItems ?? null,
    itemCount,
  );

  return c.json({
    cardId: card.cardId,
    cardKey: card.cardKey,
    deckKey: card.deckKey,
    deckTitle: card.deckTitle,
    kind: card.kind,
    groupKey: card.groupKey,
    prompt: card.prompt,
    items: card.items,
    blanks: card.blanks,
    verbatim: card.verbatim,
    state: card.state,
    mode: pendingItems.length > 0 ? "retest" : "first",
    pendingItems: pendingItems.length > 0 ? pendingItems : null,
  });
});

// ---------- GET /recall/queue ----------

const recallQueueRoute = createRoute({
  method: "get",
  path: "/recall/queue",
  summary: "获取今日回忆队列（到期优先 + 新卡额度）",
  description:
    "只读接口，需 read 作用域。`ids` 是本次要做的卡片主键序列（到期优先、按 due 升序，其后是今天投放的新卡）；`due` / `fresh` 是**条数**而不是 id 数组，编号一律从 `ids` 取。队列是纯查询，同一时刻重复调用结果一致。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            ids: z
              .array(z.number().int())
              .describe("本次要做的卡片主键，顺序即建议作答顺序"),
            due: z.number().int().describe("到期卡条数（含重测卡）"),
            fresh: z.number().int().describe("今日投放的新卡条数"),
            total: z.number().int().describe("队列总条数 = due + fresh"),
            estimatedMinutes: z.number().int().describe("展示用估时（分钟）"),
            streakDays: z
              .number()
              .int()
              .describe("连续学习天数（学习日 04:00 切换）"),
          }),
        },
      },
      description: "今日队列",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(recallQueueRoute, async (c) => {
  const identity = requireIdentity(c);
  const now = new Date();
  const userId = identity.effectiveUserId;

  const queue = await getTodayQueue(userId, { now });
  const streakDays = await computeStreakDays(userId, now);

  return c.json({
    // 顺序 = 到期优先 + 新卡（服务层已按此顺序拼好，客户端据此逐张取卡）
    ids: [...queue.due, ...queue.fresh],
    due: queue.due.length,
    fresh: queue.fresh.length,
    total: queue.total,
    estimatedMinutes: queue.estimatedMinutes,
    streakDays,
  });
});

// ---------- POST /recall/reviews ----------

const RecallReviewRequestSchema = z
  .object({
    cardId: z.number().int().positive().openapi({
      description: "卡片数字主键（来自 GET /recall/cards/:cardId 或队列 ids）",
      example: 42,
    }),
    typed: z.string().openapi({
      description: "用户作答原文；填空卡按呈现顺序分段",
      example: "1. 建立安全制度 2. 开展安全演练",
    }),
    allBlank: z.boolean().optional().openapi({
      description: "用户点了「全没想起」：所有呈现条目都算未写",
    }),
    overrides: z
      .array(
        z.object({
          index: z.number().int().nonnegative().openapi({
            description: "卡内条目下标（与 pendingItems 同一坐标系）",
          }),
          to: z.enum(["ok", "miss"]).openapi({ description: "改判结果" }),
        }),
      )
      .optional()
      .openapi({ description: "用户改判项，可空" }),
    clientKey: z.string().trim().min(1).max(120).optional().openapi({
      description:
        "幂等键（客户端进入判分屏时生成的 UUID）。同一次作答的所有重试必须沿用同一个 key；服务端命中后返回首次结果（duplicate=true），不会二次推进调度",
      example: "6f1c1d5e-2a4b-4f0e-9c2f-8f0a2d1b7c33",
    }),
  })
  .openapi("ExternalRecallReviewRequest");

const RecallReviewResponseSchema = z
  .object({
    verdicts: z
      .array(z.enum(["ok", "miss"]))
      .describe("最终判分（已应用改判），与本次呈现的条目一一对应"),
    rating: z
      .enum(["again", "hard", "good"])
      .describe("推导出的 FSRS 评分（用户不直接选择）"),
    nextDue: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    pendingItems: z
      .array(z.number().int())
      .nullable()
      .describe("下次要重测的条目下标；null 表示无需重测"),
    nextReviewText: z
      .string()
      .describe(
        "可直接展示的提示，如「下次 11 月 20 日」「明天只重测这 2 条」",
      ),
    duplicate: z
      .boolean()
      .describe("true = 该 clientKey 已提交过，本次为幂等重放，未推进调度"),
    dryRun: z.boolean().optional().openapi({
      description:
        "仅预演时出现且恒为 true：本次没有写库，评分与到期时间是真实计算结果",
    }),
  })
  .openapi("ExternalRecallReviewResponse");

const recallReviewsRoute = createRoute({
  method: "post",
  path: "/recall/reviews",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "提交一次回忆作答（判分 + 调度 + 落日志）",
  description:
    "写接口，需 write 作用域。服务端按卡片内容判分、推导评分并推进 FSRS 调度。带 `clientKey` 时按 `(user_id, clientKey)` 幂等：重试命中返回 `duplicate: true` 与首次结果，**不会二次推进调度**。卡片不存在返回 404。",
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallReviewRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallReviewResponseSchema },
      },
      description: "判分结果（或幂等重放，见 duplicate）",
    },
    400: { description: "请求体校验失败 / 改判下标非法" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡片不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallReviewsRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));
  const userId = identity.effectiveUserId;

  // 先判存在性再提交：submitReview 会把"卡不存在"和"改判下标非法"都抛成
  // 业务错误，路由层无法区分；用只读查询把 404 与 400 分开，语义才稳定。
  const card = await findCard(userId, body.cardId);
  if (!card) {
    return c.json({ error: `卡片不存在：${body.cardId}` }, 404);
  }

  try {
    const result = await submitReview(userId, body.cardId, {
      typed: body.typed,
      allBlank: body.allBlank,
      overrides: body.overrides,
      // 幂等键必须原样透传：服务层按 (user_id, client_key) 判断是否重放
      clientKey: body.clientKey,
      dryRun,
    });

    return c.json(
      {
        verdicts: result.verdicts,
        rating: result.rating,
        nextDue: result.nextDue,
        pendingItems: result.pendingItems,
        nextReviewText: buildNextReviewText(
          result.nextDue,
          result.pendingItems,
        ),
        duplicate: result.duplicate,
        ...(result.dryRun ? { dryRun: true } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /recall/decks ----------

const RecallDeckImportRequestSchema = z
  .object({
    json: z.string().min(1).openapi({
      description: "卡组文件内容（JSON 字符串，schema=1）",
      example: '{"schema":1,"deckId":"deck-1","title":"教育法规","cards":[…]',
    }),
    onConflict: z.enum(["keep", "accept"]).optional().openapi({
      description:
        "内容冲突策略：keep（默认，保留库内内容）/ accept（采用文件内容，进度不受影响）",
    }),
  })
  .openapi("ExternalRecallDeckImportRequest");

const RecallDeckImportResponseSchema = z
  .object({
    deckKey: z.string().describe("卡组标识"),
    createdCards: z.number().int().describe("本次新建的卡片数"),
    updatedCards: z
      .number()
      .int()
      .describe("内容被文件覆盖的卡片数（仅 accept）"),
    skippedCards: z.number().int().describe("内容一致、完全跳过的卡片数"),
    conflicts: z
      .array(
        z.object({
          cardId: z.string().describe("卡片标识"),
          action: z.enum(["keep", "accept"]).describe("该冲突的处理方式"),
        }),
      )
      .describe("内容冲突清单"),
    missingInFile: z
      .array(z.string())
      .describe("库里有、文件里没有的 cardId（不会删除）"),
    dryRun: z.boolean().optional().openapi({
      description:
        '仅预演时出现且恒为 true：本次没有写库，三组计数是"真执行会怎样"',
    }),
  })
  .openapi("ExternalRecallDeckImportResponse");

const recallDeckImportRoute = createRoute({
  method: "post",
  path: "/recall/decks",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "导入（或更新）一个回忆卡组",
  description:
    "写接口，需 write 作用域。幂等：同一份文件重复导入不新增、不重置任何人的复习进度。文件里没有的卡片不删除，只在 `missingInFile` 里报告。`schema` 版本不支持或内容校验失败返回 400 且库内零写入。",
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallDeckImportRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallDeckImportResponseSchema },
      },
      description: "导入结果",
    },
    400: { description: "卡组内容校验失败（带 issues）" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallDeckImportRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    // 直接传 JSON 字符串：parseRecallDeck 统一处理解析与校验，
    // 避免路由层再写一遍 JSON.parse → 错误文案分叉
    const result = await importDeck(identity.effectiveUserId, body.json, {
      onConflict: body.onConflict,
      dryRun,
    });

    return c.json(
      {
        deckKey: result.deckKey,
        createdCards: result.createdCards,
        updatedCards: result.updatedCards,
        skippedCards: result.skippedCards,
        conflicts: result.conflicts,
        missingInFile: result.missingInFile,
        ...(result.dryRun ? { dryRun: true } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /recall/cards ----------

const RecallCardUpsertRequestSchema = z
  .object({
    deckKey: z.string().trim().min(1).max(120).openapi({
      description: "卡组标识",
      example: "deck-1",
    }),
    cardId: z.string().trim().min(1).max(120).openapi({
      description: "卡组内的卡片标识（文件里的 cardId，非数字主键）",
      example: "L1-c01",
    }),
    prompt: z.string().trim().min(1).openapi({ description: "题干" }),
    kind: z.enum(["list", "cloze"]).openapi({
      description: "list = 列举卡（用 items）/ cloze = 填空卡（用 blanks）",
    }),
    items: z
      .array(RecallListItemSchema)
      .min(1)
      .max(6)
      .optional()
      .openapi({ description: "列举卡条目，1–6 条；kind=list 时必填" }),
    blanks: z
      .array(RecallBlankSchema)
      .min(1)
      .optional()
      .openapi({ description: "填空卡空位；kind=cloze 时必填" }),
    verbatim: z.boolean().optional().openapi({
      description: "逐字判分开关；不传 = 沿用库内旧值",
    }),
    groupId: z.string().trim().min(1).max(120).nullable().optional().openapi({
      description: "分组；不传 = 沿用旧值，传 null = 移出分组",
    }),
  })
  .openapi("ExternalRecallCardUpsertRequest");

const RecallCardUpsertResponseSchema = z
  .object({
    cardId: z.number().int().describe("卡片的数字主键"),
    cardKey: z.string().describe("卡片文件内标识（与请求里的 cardId 相同）"),
    created: z
      .boolean()
      .describe("true = 本次新建；false = 覆盖了同 cardId 的既有卡片"),
    dryRun: z.boolean().optional().openapi({
      description: "仅预演时出现且恒为 true：业务数据没有变更",
    }),
  })
  .openapi("ExternalRecallCardUpsertResponse");

const recallCardUpsertRoute = createRoute({
  method: "post",
  path: "/recall/cards",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "新建或修改一张回忆卡",
  description:
    "写接口，需 write 作用域。卡片内容全局共享，写入**不会**重置任何人的复习进度。校验规则与整包导入一致（列举 1–6 条、每空 1–3 个可接受答案）。卡组不存在返回 404，内容非法返回 400（带 issues）。",
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallCardUpsertRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallCardUpsertResponseSchema },
      },
      description: "已写入（新建或更新）",
    },
    400: {
      description: "内容校验失败（带 issues）/ kind 与 items/blanks 不匹配",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardUpsertRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const { cardId, created } = await upsertCard(
      identity.effectiveUserId,
      {
        deckKey: body.deckKey,
        cardId: body.cardId,
        prompt: body.prompt,
        kind: body.kind,
        items: body.items,
        blanks: body.blanks,
        verbatim: body.verbatim,
        groupId: body.groupId,
      },
      { dryRun },
    );

    return c.json(
      {
        cardId,
        cardKey: body.cardId,
        created,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- DELETE /recall/decks/:deckKey/cards/:cardKey ----------

const recallCardDeleteRoute = createRoute({
  method: "delete",
  path: "/recall/decks/{deckKey}/cards/{cardKey}",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "删除一张回忆卡（含其全部作答日志与进度）",
  description:
    "写接口，需 write 作用域。删除是全局的：卡片内容共存，删除后所有用户都看不到它，其作答日志与进度一并删除（与界面上的删除行为一致）。卡组或卡片不存在返回 404。",
  request: {
    query: DryRunQuerySchema,
    params: z.object({
      deckKey: z.string().describe("卡组标识"),
      cardKey: z.string().describe("卡片在卡组内的标识（文件里的 cardId）"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int().describe("被删除卡片的数字主键"),
            cardKey: z.string().describe("被删除卡片的文件内标识"),
            deleted: z
              .boolean()
              .describe(
                "true = 真的删掉了；false = 预演（dryRun），库内没有任何变更",
              ),
            reviewLogs: z
              .number()
              .int()
              .describe("本次删除的作答日志条数（全局，含其他用户）"),
            cardStates: z
              .number()
              .int()
              .describe("本次删除的复习进度行数（全局，含其他用户）"),
            dryRun: z.boolean().optional().openapi({
              description:
                '仅预演时出现且恒为 true：本次没有删除，计数是"真执行会删掉多少"',
            }),
          }),
        },
      },
      description: "已删除（预演时只返回将删除的计数）",
    },
    400: {
      description:
        "参数校验失败（如 dryRun 取值不是 true/false）—— 此时不会删除任何东西",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在 / 卡片不在该卡组里" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardDeleteRoute, async (c) => {
  const identity = requireIdentity(c);
  const { deckKey, cardKey } = c.req.valid("param");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const { cardId, reviewLogs, cardStates } = await deleteCard(
      identity.effectiveUserId,
      deckKey,
      cardKey,
      { dryRun },
    );
    return c.json(
      {
        cardId,
        cardKey,
        // 预演时什么都没删，deleted 不能回 true —— 否则调用方会以为已经生效
        deleted: !dryRun,
        reviewLogs,
        cardStates,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ==================== 个人内容：笔记 / 导图 / SRS 概览 ====================
// 这三组读接口补的是「只靠 docs/api.md 能不能完成一件真实任务」的缺口：
// 笔记、思维导图、SRS 负载以前只有 Server Action，对 agent 等于不存在。
// 统一走 limit/offset/meta（docs/api.md §2 的口径），不做第二套分页形状。

// ---------- GET /notes ----------

const notesQuery = PaginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("标题/正文关键词；不传返回全部（按更新时间倒序）"),
});

const NoteListItemSchema = z.object({
  id: z.number().int().describe("笔记 ID（取全文用 GET /notes/{id}）"),
  title: z.string().describe("标题"),
  preview: z.string().describe("正文前 200 字（列表只给预览，避免刷爆上下文）"),
  updatedAt: z.string().nullable().describe("更新时间（SQLite UTC 文本）"),
});

const notesRoute = createRoute({
  method: "get",
  path: "/notes",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "列出当前用户的笔记（可关键词搜索）",
  description:
    "只读接口，需 read 作用域。按更新时间倒序分页；传 `q` 时在标题与正文里做 LIKE 搜索。只返回预览（正文前 200 字），全文用 `GET /notes/{id}`。跨用户数据不可见。",
  request: { query: notesQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(NoteListItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "笔记列表",
    },
    400: { description: "参数校验失败" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(notesRoute, async (c) => {
  const identity = requireIdentity(c);
  const query = c.req.valid("query");
  const { limit, offset } = parsePagination(query);
  const userId = identity.effectiveUserId;

  try {
    // 搜索走 SQL 分页入口：界面用的 searchNotes 先截 50 条再返回，
    // 拿来当 REST 会让 offset>=50 永远空页、total 也谎报 50（评审指出过）
    if (query.q) {
      const { items, total } = await knowledgeService.searchNotesPage(
        userId,
        query.q,
        { limit, offset },
      );
      return c.json(
        {
          data: items.map((note) => ({
            id: note.id,
            title: note.title,
            preview: note.preview ?? "",
            updatedAt: note.updated_at ?? null,
          })),
          meta: { limit, offset, total },
        },
        200,
      );
    }

    // 无关键词：复用服务层的排序口径，切片在内存里做（笔记总量是个人量级）
    const all = await knowledgeService.getNoteList(userId);
    const page = all.slice(offset, offset + limit).map((note) => ({
      id: note.id,
      title: note.title,
      preview: note.preview ?? "",
      updatedAt: note.updated_at ?? null,
    }));

    return c.json(
      { data: page, meta: { limit, offset, total: all.length } },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取笔记列表失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- GET /notes/{id} ----------

const notesDetailRoute = createRoute({
  method: "get",
  path: "/notes/{id}",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "读取一篇笔记的全文",
  description:
    "只读接口，需 read 作用域。返回标题、正文与时间戳；笔记不存在或不属于当前身份一律 404（不泄露 ID 是否存在）。",
  request: { params: z.object({ id: z.string().describe("笔记 ID") }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            title: z.string(),
            content: z.string().describe("正文（Markdown 源文）"),
            createdAt: z.string().nullable(),
            updatedAt: z.string().nullable(),
          }),
        },
      },
      description: "笔记全文",
    },
    400: { description: "笔记 ID 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "笔记不存在（或不属于当前身份）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(notesDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { id } = c.req.valid("param");
  const noteId = parsePositiveInt(id);
  if (noteId === null) {
    return c.json({ error: "笔记 ID 必须是正整数" }, 400);
  }

  // 这里直接查库而不是复用 knowledgeService.getNoteDetail：后者用 throw Error
  // 表达"不存在"，路由层只能靠匹配错误文案来分辨 404，文案一改就静默变成 500
  const [note] = await drizzleDb
    .select()
    .from(drizzleSchema.notes)
    .where(
      and(
        eq(drizzleSchema.notes.id, noteId),
        eq(drizzleSchema.notes.user_id, identity.effectiveUserId),
      ),
    )
    .limit(1);

  if (!note) {
    return c.json({ error: `笔记不存在：${noteId}` }, 404);
  }

  return c.json(
    {
      id: note.id,
      title: note.title,
      content: note.content ?? "",
      createdAt: note.created_at ?? null,
      updatedAt: note.updated_at ?? null,
    },
    200,
  );
});

// ---------- GET /mindmaps ----------

const MindmapListItemSchema = z.object({
  id: z.number().int().describe("导图 ID（取内容用 GET /mindmaps/{id}）"),
  title: z.string().describe("标题"),
  updatedAt: z.string().nullable().describe("更新时间（SQLite UTC 文本）"),
});

const mindmapsRoute = createRoute({
  method: "get",
  path: "/mindmaps",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "列出当前用户的思维导图",
  description:
    "只读接口，需 read 作用域。按更新时间倒序分页。只返回标题级信息，内容用 `GET /mindmaps/{id}`。跨用户数据不可见。",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(MindmapListItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "思维导图列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(mindmapsRoute, async (c) => {
  const identity = requireIdentity(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  try {
    const all = await mindmapService.getList(identity.effectiveUserId);
    const page = all.slice(offset, offset + limit).map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updated_at ?? null,
    }));
    return c.json(
      { data: page, meta: { limit, offset, total: all.length } },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取思维导图列表失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- GET /mindmaps/{id} ----------

const mindmapDetailRoute = createRoute({
  method: "get",
  path: "/mindmaps/{id}",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "读取一张思维导图的内容",
  description:
    "只读接口，需 read 作用域。`content` 是导图的 Markdown/大纲源文（与界面编辑器同一份字符串）。导图不存在或不属于当前身份一律 404。",
  request: { params: z.object({ id: z.string().describe("导图 ID") }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            title: z.string(),
            content: z.string().describe("导图内容（Markdown 大纲源文）"),
            createdAt: z.string().nullable(),
            updatedAt: z.string().nullable(),
          }),
        },
      },
      description: "思维导图内容",
    },
    400: { description: "导图 ID 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "导图不存在（或不属于当前身份）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(mindmapDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { id } = c.req.valid("param");
  const mindmapId = parsePositiveInt(id);
  if (mindmapId === null) {
    return c.json({ error: "导图 ID 必须是正整数" }, 400);
  }

  const [row] = await drizzleDb
    .select()
    .from(drizzleSchema.mindmaps)
    .where(
      and(
        eq(drizzleSchema.mindmaps.id, mindmapId),
        eq(drizzleSchema.mindmaps.user_id, identity.effectiveUserId),
      ),
    )
    .limit(1);

  if (!row) {
    return c.json({ error: `导图不存在：${mindmapId}` }, 404);
  }

  return c.json(
    {
      id: row.id,
      title: row.title,
      content: row.content ?? "",
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    },
    200,
  );
});

// ---------- GET /srs/summary ----------

const srsSummaryRoute = createRoute({
  method: "get",
  path: "/srs/summary",
  summary: "SRS 复习负载概览（含未来 7 天预估）",
  description:
    "只读接口，需 read 作用域。给出错题 SRS 的卡片总量、状态分布、未来 7 天每天要复习多少张/约多少分钟。这是「明天该复习什么」的最小数据面——具体题目用 `GET /wrong-book` 取。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            totalCards: z.number().int().describe("进入 SRS 的错题卡总数"),
            stateDistribution: z.object({
              new: z.number().int(),
              learning: z.number().int(),
              review: z.number().int(),
              relearning: z.number().int(),
            }),
            learnedCount: z.number().int().describe("已进入学习/复习的卡片数"),
            retention: z
              .object({
                trueRetention: z.number().describe("真实保留率（0-1）"),
                totalReviews: z.number().int().describe("累计复习次数"),
              })
              .describe(
                "保留率统计；`totalReviews` 是**最近 30 天**的复习次数，不是历史总数",
              ),
            next7Days: z
              .object({
                count: z.number().int().describe("未来 7 天待复习总张数"),
                minutes: z.number().int().describe("预估总时长（分钟）"),
              })
              .describe("未来 7 天的复习负载合计"),
            daily: z
              .array(
                z.object({
                  date: z.string().describe("日期（YYYY-MM-DD）"),
                  count: z.number().int().describe("当天待复习张数"),
                  minutes: z.number().int().describe("当天预估分钟数"),
                }),
              )
              .describe("逐日负载；agent 用来排计划，不要一次渲染给用户"),
          }),
        },
      },
      description: "SRS 概览",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(srsSummaryRoute, async (c) => {
  const identity = requireIdentity(c);

  try {
    const stats = await srsService.getGlobalStats(identity.effectiveUserId);
    const summary = summarizeFutureReviews(stats.futureReviews);

    return c.json(
      {
        totalCards: stats.totalCards,
        stateDistribution: stats.stateDistribution,
        learnedCount: stats.learnedCount,
        retention: stats.retentionStats,
        next7Days: { count: summary.totalCount, minutes: summary.totalMinutes },
        daily: stats.futureReviews.map((day) => ({
          date: day.date,
          count: day.count,
          minutes: day.estimatedMinutes,
        })),
      },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取 SRS 概览失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- POST /recall/cards/{cardId}/archive ----------
// 归档是「按身份」的动作：卡片内容全局共享，但每个人都该能自己把它移出队列。

const archiveRoute = createRoute({
  method: "post",
  path: "/recall/cards/{cardId}/archive",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "把一张回忆卡移出当前身份的复习队列（归档）",
  description:
    "写接口，需 write 作用域。只影响**调用身份**的队列，不改卡片内容与别人的进度。天然幂等：重复归档仍是同一个结果。卡片不存在返回 404。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            archived: z.literal(true).describe("恒为 true"),
          }),
        },
      },
      description: "已归档",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    404: { description: "卡片不存在" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(archiveRoute, async (c) => {
  const identity = requireIdentity(c);
  const { cardId } = c.req.valid("param");
  const id = parsePositiveInt(cardId);
  if (id === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    await archiveCard(identity.effectiveUserId, id);
    return c.json({ cardId: id, archived: true as const }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- DELETE /recall/cards/{cardId}/archive ----------

const unarchiveRoute = createRoute({
  method: "delete",
  path: "/recall/cards/{cardId}/archive",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "把一张回忆卡放回复习队列（取消归档）",
  description:
    "写接口，需 write 作用域。只影响**调用身份**。天然幂等：没归档过时返回 `restored: false`（没有可恢复的状态行），不算错误。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            restored: z
              .boolean()
              .describe("true = 恢复了一条状态行；false = 本来就没有归档记录"),
          }),
        },
      },
      description: "已取消归档（或本来就没有归档）",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(unarchiveRoute, async (c) => {
  const identity = requireIdentity(c);
  const { cardId } = c.req.valid("param");
  const id = parsePositiveInt(cardId);
  if (id === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    const restored = await unarchiveCard(identity.effectiveUserId, id);
    return c.json({ cardId: id, restored }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /srs/reviews ----------
// 错题 SRS 的唯一写入口。以前这条链路只在答题流程里发生（PracticeService 内部），
// 外部数据推不动复习队列 —— agent 补做一道错题后没法让它进入明天的复习。

const SrsReviewRequestSchema = z
  .object({
    questionId: z.number().int().positive().describe("题目 ID"),
    isCorrect: z
      .boolean()
      .describe("本次是否答对（服务端不重算；传错会污染调度）"),
    durationMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("作答耗时（毫秒），默认 0；影响评分推导"),
    userAnswerLength: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("填空类作答的字符数；影响评分推导"),
    answeredAt: z
      .string()
      .optional()
      .describe(
        "本次作答时间（ISO 8601）。同时是幂等键：同一时间去重试不会二次推进调度",
      ),
  })
  .openapi("ExternalSrsReviewRequest");

const SrsReviewResponseSchema = z
  .object({
    questionId: z.number().int(),
    dueDate: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    stability: z.number().describe("FSRS 记忆稳定度"),
    difficulty: z.number().describe("FSRS 难度"),
    reps: z.number().int().describe("累计复习次数"),
    lapses: z.number().int().describe("累计遗忘次数"),
    state: z
      .number()
      .int()
      .describe("FSRS 状态：0 New / 1 Learning / 2 Review / 3 Relearning"),
    duplicate: z
      .boolean()
      .describe("true = 同一 answeredAt 已处理过，本次未推进调度"),
  })
  .openapi("ExternalSrsReviewResponse");

const srsReviewRoute = createRoute({
  method: "post",
  path: "/srs/reviews",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "提交一次错题复习（推进该身份的 SRS 调度）",
  description:
    "写接口，需 write 作用域。按 `isCorrect` 与耗时推导 FSRS 评分并推进该身份的 `question_srs`，这是让外部数据影响复习队列的唯一入口。**幂等**：带 `answeredAt` 时，同一时间的重试直接返回当前状态（`duplicate: true`），不会二次推进。题目不存在返回 404。",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SrsReviewRequestSchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: SrsReviewResponseSchema },
      },
      description: "推进后的调度状态（或幂等重放）",
    },
    400: { description: "请求体校验失败 / answeredAt 不是合法时间" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    404: { description: "题目不存在" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(srsReviewRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const userId = identity.effectiveUserId;

  // 只把 undefined 当成"用当前时间"；空串/非法串必须 400，
  // 否则 answeredAt:"" 会静默退化成"现在"，把幂等键变成每次都不一样
  const answeredAt =
    body.answeredAt === undefined ? new Date() : new Date(body.answeredAt);
  if (Number.isNaN(answeredAt.getTime())) {
    return c.json({ error: "answeredAt 不是合法时间" }, 400);
  }

  // 题目存在性先判：srsService 用 throw Error 表达"题目不存在"，
  // 路由层没有可靠办法把它与真实故障区分成 404 / 500
  const [question] = await drizzleDb
    .select({ id: drizzleSchema.questions.id })
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.id, body.questionId))
    .limit(1);
  if (!question) {
    return c.json({ error: `题目不存在：${body.questionId}` }, 404);
  }

  const answeredAtIso = answeredAt.toISOString();

  try {
    // 读-判-写必须在同一事务里，并按 (user, question) 串行：
    // 否则两笔并发请求会各自读到同一份旧状态、各自 +1，后写的把前者覆盖掉
    // （评审指出的两条竞态）；阅读速度的采样也走同一个 exec，调度失败时一起回滚
    const outcome = await withKeyedLock(
      `srs:${userId}:${body.questionId}`,
      () =>
        withTransaction(async (exec) => {
          const [existing] = await exec
            .select()
            .from(drizzleSchema.question_srs)
            .where(
              and(
                eq(drizzleSchema.question_srs.user_id, userId),
                eq(drizzleSchema.question_srs.question_id, body.questionId),
              ),
            )
            .limit(1);

          // 幂等：answeredAt 落到 last_review 上，同一时间重试直接返回当前状态。
          // 不用客户端 UUID 是为了不新增一张表 —— 复习本来就是"一个时间点一条"。
          if (existing?.last_review === answeredAtIso) {
            return { duplicate: true as const, row: existing };
          }

          const item = await srsService.updateQuestionSrs(
            userId,
            body.questionId,
            body.isCorrect,
            body.durationMs ?? 0,
            answeredAt,
            undefined,
            body.userAnswerLength,
            exec,
          );
          return { duplicate: false as const, item };
        }),
    );

    if (outcome.duplicate) {
      return c.json(
        {
          questionId: body.questionId,
          dueDate: outcome.row.due_date,
          stability: outcome.row.stability,
          difficulty: outcome.row.difficulty,
          reps: outcome.row.reps,
          lapses: outcome.row.lapses,
          state: outcome.row.state,
          duplicate: true,
        },
        200,
      );
    }

    const item = outcome.item;
    return c.json(
      {
        questionId: body.questionId,
        dueDate: item.due.toISOString(),
        stability: item.stability,
        difficulty: item.difficulty,
        reps: item.reps,
        lapses: item.lapses,
        state: item.state,
        duplicate: false,
      },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 推进 SRS 失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ==================== 题库写接口（admin 作用域） ====================
// 为什么是 admin 而不是 write：题库是**全局共享资产**，任何 write key 都能改它
// 等于把所有人的练习内容交给任意 agent。建/改题按 admin 作用域放行，签发时人工决定。
//
// 幂等键：内容指纹 `api:` + (题干 + 选项 + 答案)。同一份内容重复建题不新增行；
// 改题后指纹重算，与既有行撞键返回 409 而不是静默覆盖。

const QuestionWriteBodySchema = z
  .object({
    content: z.string().min(5).describe("题干，至少 5 个字符"),
    options: z
      .array(z.string().min(1))
      .max(10)
      .default([])
      .describe("选项文本；判断题固定两个、填空题可为空"),
    answer: z
      .string()
      .min(1)
      .describe(
        '正确答案：单选传标号（A）或多选传 JSON 数组字符串（["A","B"]），判断题 A/B，填空题为自由文本',
      ),
    explanation: z.string().min(5).describe("解析，至少 5 个字符"),
    tags: z.array(z.string().min(1)).min(1).describe("知识点标签，至少 1 个"),
    dimension: z
      .enum(["knowledge", "understanding", "application"])
      .describe("能力维度"),
    type: z
      .enum(["single", "multi", "truefalse", "fill_blank"])
      .default("single")
      .describe("题型，默认 single"),
  })
  .openapi("ExternalQuestionWriteBody");

const QuestionWriteResponseSchema = z
  .object({
    id: z
      .number()
      .int()
      .nullable()
      .describe("题目 ID；预演且内容不存在时为 null（不要拿它去调查详情接口）"),
    externalId: z.string().describe("内容指纹（幂等键，`api:` 前缀）"),
    duplicate: z
      .boolean()
      .describe("true = 同内容已存在，本次未新增（返回既有 id）"),
    dryRun: z.boolean().optional().openapi({
      description: "仅预演时出现且恒为 true：业务数据没有变更",
    }),
  })
  .openapi("ExternalQuestionWriteResponse");

const questionsCreateRoute = createRoute({
  method: "post",
  path: "/questions",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "新建一道题（内容指纹幂等，需 admin 作用域）",
  description:
    "写接口，**需 admin 作用域**：题库是全局共享资产，write key 不能改。幂等键是内容指纹 `api:`+（题干+选项+答案）——同一份内容重复提交返回既有 `id` 且 `duplicate: true`，不会新增行。校验口径与后台导入完全一致（`QuestionSchema`）。预演传 `?dryRun=true`。",
  request: {
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: QuestionWriteBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: QuestionWriteResponseSchema },
      },
      description: "已写入（或幂等命中既有题目）",
    },
    400: { description: "内容校验失败（带 issues）" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 admin）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(questionsCreateRoute, async (c) => {
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  // 校验与后台导入共用同一份 schema：两处规则一旦分叉，同一道题会"后台能导、API 不能建"
  const parsed = QuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "内容校验失败", issues: formatIssues(parsed.error) },
      400,
    );
  }
  const data = parsed.data;
  const externalId = buildApiExternalId({
    content: data.content,
    options: data.options,
    answer: data.answer,
  });

  const [existing] = await drizzleDb
    .select({ id: drizzleSchema.questions.id })
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.external_id, externalId))
    .limit(1);

  if (existing) {
    return c.json(
      {
        id: existing.id,
        externalId,
        duplicate: true,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  }

  if (dryRun) {
    // 预演且库里没有这道题：不给假 ID（0 会被调用方当成真实题目去查详情）
    return c.json(
      { id: null, externalId, duplicate: false, dryRun: true as const },
      200,
    );
  }

  try {
    const [inserted] = await drizzleDb
      .insert(drizzleSchema.questions)
      .values({
        external_id: externalId,
        content: data.content,
        options: JSON.stringify(data.options),
        answer: data.answer,
        explanation: data.explanation,
        tags: JSON.stringify(data.tags),
        dimension: data.dimension as
          "knowledge" | "understanding" | "application",
        type: data.type,
        created_at: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoNothing({ target: drizzleSchema.questions.external_id })
      .returning({ id: drizzleSchema.questions.id });

    // 并发窗口：预检没命中、插入时另一次请求先提交 → 唯一索引吞掉插入
    // 并发窗口：预检没命中、插入时另一次请求先提交 → 唯一索引吞掉插入。
    // 回查要有限重试：胜出的那行可能在写入与回查之间被删掉，此时既不能返回
    // id:0 冒充"已存在"，也不能静默改口说"新建成功"
    if (!inserted) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const [raced] = await drizzleDb
          .select({ id: drizzleSchema.questions.id })
          .from(drizzleSchema.questions)
          .where(eq(drizzleSchema.questions.external_id, externalId))
          .limit(1);
        if (raced) {
          return c.json({ id: raced.id, externalId, duplicate: true }, 200);
        }
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
      logger.warn(
        { externalId },
        "[External] 建题冲突后读不到既有行（可能已被删除），提示重试",
      );
      return c.json(
        { error: "建题冲突后未能读到既有题目，请重试", externalId },
        409,
      );
    }

    // 建完立刻重建向量（不 await）：检索索引落后于题库会让 agent 检索不到新题
    void indexQuestion(inserted.id).catch((err: unknown) => {
      logger.warn(
        { err, questionId: inserted.id },
        "[External] 新题向量索引失败",
      );
    });

    return c.json({ id: inserted.id, externalId, duplicate: false }, 200);
  } catch (err) {
    logger.error({ err }, "[External] 建题失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- PATCH /questions/{id} ----------

// 不能用 QuestionWriteBodySchema.partial()：zod 的 `.default()` 在 partial 后仍会
// 补值，导致"只改解析"的请求被悄悄带上 type:"single"、options:[] 等默认值，
// 合并后把原有选项清空（校验直接 400），changed 也会谎报一堆没改的字段。
// 因此这里手写一份"无默认值、全可选"的 schema，真正的合法性交给合并后的 QuestionSchema。
const QuestionPatchBodySchema = z
  .object({
    content: z.string().min(5).optional(),
    options: z.array(z.string().min(1)).max(10).optional(),
    answer: z.string().min(1).optional(),
    explanation: z.string().min(5).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    dimension: z.enum(["knowledge", "understanding", "application"]).optional(),
    type: z.enum(["single", "multi", "truefalse", "fill_blank"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少要改一个字段",
  })
  .openapi("ExternalQuestionPatchBody");

const questionsPatchRoute = createRoute({
  method: "patch",
  path: "/questions/{id}",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "修改一道题（需 admin 作用域）",
  description:
    "写接口，**需 admin 作用域**。部分更新：只改传了的字段，改完仍要整体满足 `QuestionSchema`（否则 400 带 issues）。改题干/选项/答案会重算内容指纹；若新指纹与**另一道题**撞键返回 409（不静默合并）。预演传 `?dryRun=true`，返回将会变更的字段名。",
  request: {
    params: z.object({ id: z.string().describe("题目 ID") }),
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: QuestionPatchBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            externalId: z.string().describe("更新后的内容指纹"),
            changed: z.array(z.string()).describe("本次实际变更的字段名"),
            dryRun: z.boolean().optional().openapi({
              description: "仅预演时出现且恒为 true：业务数据没有变更",
            }),
          }),
        },
      },
      description: "已更新（或预演结果）",
    },
    400: { description: "合并后校验失败（带 issues）/ ID 非正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 admin）" },
    404: { description: "题目不存在" },
    409: {
      description:
        "两种冲突：改后内容与另一道题相同（带 conflictingId），或题目在你读取后被他人修改（code=question.patch.conflict，重读后重试）",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            conflictingId: z
              .number()
              .int()
              .optional()
              .describe("撞键时指向的另一道题的 ID"),
            code: z
              .string()
              .optional()
              .describe("乐观锁冲突时固定为 question.patch.conflict"),
          }),
        },
      },
    },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(questionsPatchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  const questionId = parsePositiveInt(id);
  if (questionId === null) {
    return c.json({ error: "题目 ID 必须是正整数" }, 400);
  }

  const [existing] = await drizzleDb
    .select()
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.id, questionId))
    .limit(1);

  if (!existing) {
    return c.json({ error: `题目不存在：${questionId}` }, 404);
  }

  // 先记下"读到的版本"，写入时用它做乐观并发控制（见下方 where 条件）：
  // 两个请求各自读到同一版本时，后提交的那个会因为行已变而更新不到行，
  // 从而不会把前一次的编辑覆盖回旧值
  const snapshot = {
    content: existing.content,
    options: existing.options,
    answer: existing.answer,
  };

  const currentOptions = safeParseJson<string[]>(existing.options, []);
  const currentTags = safeParseJson<string[]>(existing.tags, []);

  // 合并只用于**校验**：部分更新同样不能产出"单选却只有一个选项"这类坏行。
  // 注意不能把 merged 整体写回库 —— 那会把未提交字段的默认值（type/dimension）落盘
  const merged = {
    content: patch.content ?? existing.content,
    options: patch.options ?? currentOptions,
    answer: patch.answer ?? existing.answer ?? "",
    explanation: patch.explanation ?? existing.explanation ?? "",
    tags: patch.tags ?? currentTags,
    dimension: patch.dimension ?? existing.dimension ?? "knowledge",
    type:
      patch.type ??
      (existing.type as "single" | "multi" | "truefalse" | "fill_blank") ??
      "single",
  };

  const parsed = QuestionSchema.safeParse(merged);
  if (!parsed.success) {
    return c.json(
      { error: "合并后校验失败", issues: formatIssues(parsed.error) },
      400,
    );
  }
  const data = parsed.data;

  // 只有客户端真的提交了、且值确实不同才算"变更"：
  // 原样回传当前值不该触发向量重建，也不该出现在回执里
  const nextValues: Record<string, unknown> = {};
  if (patch.content !== undefined && patch.content !== existing.content) {
    nextValues.content = data.content;
  }
  if (
    patch.options !== undefined &&
    JSON.stringify(patch.options) !== JSON.stringify(currentOptions)
  ) {
    nextValues.options = JSON.stringify(data.options);
  }
  if (patch.answer !== undefined && patch.answer !== existing.answer) {
    nextValues.answer = data.answer;
  }
  if (
    patch.explanation !== undefined &&
    patch.explanation !== existing.explanation
  ) {
    nextValues.explanation = data.explanation;
  }
  if (
    patch.tags !== undefined &&
    JSON.stringify(patch.tags) !== JSON.stringify(currentTags)
  ) {
    nextValues.tags = JSON.stringify(data.tags);
  }
  if (patch.dimension !== undefined && patch.dimension !== existing.dimension) {
    nextValues.dimension = data.dimension as
      "knowledge" | "understanding" | "application";
  }
  if (patch.type !== undefined && patch.type !== existing.type) {
    nextValues.type = data.type;
  }

  const changed = Object.keys(nextValues);

  // 指纹只在"内容三要素"真的变了时重算，且**只改自己这一域的键**：
  // 粉笔导入的行用上游题目 ID 当 external_id，被改成 api: 指纹后，
  // 下一次同 sourceKey 的导入就匹配不到它，会插出重复题（评审指出过）
  const contentTouched =
    nextValues.content !== undefined ||
    nextValues.options !== undefined ||
    nextValues.answer !== undefined;
  const ownsExternalId =
    existing.external_id === null ||
    existing.external_id === undefined ||
    existing.external_id.startsWith("api:");
  const externalId =
    contentTouched && ownsExternalId
      ? buildApiExternalId({
          content: data.content,
          options: data.options,
          answer: data.answer,
        })
      : (existing.external_id ??
        buildApiExternalId({
          content: data.content,
          options: data.options,
          answer: data.answer,
        }));

  if (externalId !== existing.external_id) {
    // 指纹撞到**别的**行：说明这次修改会让两道题变成同一道，交给人决定怎么处理
    const [clash] = await drizzleDb
      .select({ id: drizzleSchema.questions.id })
      .from(drizzleSchema.questions)
      .where(eq(drizzleSchema.questions.external_id, externalId))
      .limit(1);
    if (clash && clash.id !== questionId) {
      return c.json(
        {
          error: `改后的内容与题目 ${clash.id} 相同（内容指纹撞键）`,
          conflictingId: clash.id,
        },
        409,
      );
    }
  }

  if (dryRun) {
    return c.json(
      { id: questionId, externalId, changed, dryRun: true as const },
      200,
    );
  }

  if (changed.length === 0) {
    // 提交了但没有实际差异：不写库、不重建向量，如实回执
    return c.json({ id: questionId, externalId, changed }, 200);
  }

  try {
    // 乐观并发控制：只更新"读到的那一版"；行已被别人改过就更新不到，
    // 由调用方重读后重试，而不是把别人的编辑覆盖回旧值
    const updated = await drizzleDb
      .update(drizzleSchema.questions)
      .set({
        ...nextValues,
        ...(externalId !== existing.external_id
          ? { external_id: externalId }
          : {}),
      })
      .where(
        and(
          eq(drizzleSchema.questions.id, questionId),
          eq(drizzleSchema.questions.content, snapshot.content),
          // options/answer 可为 NULL：`eq(col, null)` 在 SQL 里永远不成立，
          // 必须按 isNull 比较，否则可空列会让乐观锁恒失败
          snapshot.options === null
            ? isNull(drizzleSchema.questions.options)
            : eq(drizzleSchema.questions.options, snapshot.options),
          snapshot.answer === null
            ? isNull(drizzleSchema.questions.answer)
            : eq(drizzleSchema.questions.answer, snapshot.answer),
        ),
      )
      .returning({ id: drizzleSchema.questions.id });

    if (updated.length === 0) {
      // 0 行有两种原因：题目被删了（404），或行在读到之后被改过（409 乐观锁冲突）。
      // 混成一种会让"题没了"被当成"稍后重试"
      const [stillThere] = await drizzleDb
        .select({ id: drizzleSchema.questions.id })
        .from(drizzleSchema.questions)
        .where(eq(drizzleSchema.questions.id, questionId))
        .limit(1);
      if (!stillThere) {
        return c.json({ error: `题目不存在：${questionId}` }, 404);
      }
      return c.json(
        {
          error: "题目在你读取之后已被他人修改，请重读后再提交",
          code: "question.patch.conflict",
        },
        409,
      );
    }

    if (
      touchesEmbeddingText(
        Object.fromEntries(changed.map((key) => [key, true])),
      )
    ) {
      void indexQuestion(questionId, { pruneOnSkip: true }).catch(
        (err: unknown) => {
          logger.warn({ err, questionId }, "[External] 改题后向量索引失败");
        },
      );
    }

    return c.json({ id: questionId, externalId, changed }, 200);
  } catch (err) {
    // 唯一索引冲突：两个不同题目同时改成同一指纹，先提交的成功、后提交的在这里炸。
    // 这类冲突是业务语义（409 + 谁占了），不是服务器故障（500）
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("UNIQUE constraint failed") &&
      message.includes("external_id")
    ) {
      const [holder] = await drizzleDb
        .select({ id: drizzleSchema.questions.id })
        .from(drizzleSchema.questions)
        .where(eq(drizzleSchema.questions.external_id, externalId))
        .limit(1);
      return c.json(
        {
          error: holder
            ? `改后的内容与题目 ${holder.id} 相同（内容指纹撞键）`
            : "改后的内容与另一道题相同（内容指纹撞键）",
          ...(holder ? { conflictingId: holder.id } : {}),
        },
        409,
      );
    }
    logger.error({ err }, "[External] 改题失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ==================== 工具函数 ====================

// JSON 解析统一走 @/lib/utils/json 的 safeParseJson（本文件原有的 safeJsonParse 是重复实现）

export default app;
