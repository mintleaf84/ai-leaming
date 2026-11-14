import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, sql, count } from "drizzle-orm";
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
  buildNextReviewText,
  computeStreakDays,
  findCard,
  getTodayQueue,
  listDeckCards,
  submitReview,
  RecallCardNotFoundError,
  RecallServiceError,
} from "@/lib/services/recall";
import {
  deleteCard,
  importDeck,
  listDecks,
  upsertCard,
  RecallImportError,
  RecallNotFoundError,
} from "@/lib/services/recall-import";
import { RecallDeckValidationError } from "@/lib/recall/schema";
import { logger } from "@/lib/logger";

const app = new OpenAPIHono();

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
  path: "/questions/:id",
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
    404: { description: "题目不存在" },
  },
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");

  const row = await drizzleDb.query.questions.findFirst({
    where: eq(drizzleSchema.questions.id, parseInt(id)),
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
  path: "/practice/sessions/:id",
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
  })
  .openapi("ExternalAgentAnswersResponse");

const importAnswersRoute = createRoute({
  method: "post",
  path: "/practice/answers",
  middleware: [requireScopeMiddleware("write")] as const,
  request: {
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
    500: { description: "服务器内部错误" },
  },
});

app.openapi(importAnswersRoute, async (c) => {
  // 与只读接口保持同一形态：身份缺失说明中间件没生效，属代码错误（500），
  // 而不是"用户没登录"（那是 401，已由 requireScope 拦截）
  const identity = requireIdentity(c);
  const body = c.req.valid("json") as AgentAnswersImportInput;

  try {
    const result = await importService.importAgentAnswers(
      identity.effectiveUserId,
      body,
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

/** 服务层异常 → HTTP 语义（外部 API 不允许把业务错误裸抛成 500） */
function recallErrorResponse(c: Context, err: unknown) {
  if (err instanceof RecallDeckValidationError) {
    return c.json(
      {
        error: "卡组内容校验失败",
        // 一次报全，但截断到 20 条：卡组可能有上百张卡，全量 issue 会让响应体失控
        issues: err.issues.slice(0, 20),
        issueCount: err.issues.length,
      },
      400,
    );
  }
  if (
    err instanceof RecallNotFoundError ||
    err instanceof RecallCardNotFoundError
  ) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof RecallImportError || err instanceof RecallServiceError) {
    // 明确的业务拒绝（改判下标非法、卡组归属不符等）：4xx + 可读原因
    return c.json({ error: err.message }, 400);
  }
  logger.error({ err }, "[External] 回忆自测接口失败");
  return c.json({ error: "服务器内部错误" }, 500);
}

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
  path: "/recall/decks/:deckKey",
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
  path: "/recall/cards/:cardId",
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

  const pendingItems = card.state?.pendingItems ?? null;

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
    mode: pendingItems && pendingItems.length > 0 ? "retest" : "first",
    pendingItems,
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
    required: true,
    body: {
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
    404: { description: "卡片不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallReviewsRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
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
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return recallErrorResponse(c, err);
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
    required: true,
    body: {
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
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallDeckImportRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");

  try {
    // 直接传 JSON 字符串：parseRecallDeck 统一处理解析与校验，
    // 避免路由层再写一遍 JSON.parse → 错误文案分叉
    const result = await importDeck(identity.effectiveUserId, body.json, {
      onConflict: body.onConflict,
    });

    return c.json(
      {
        deckKey: result.deckKey,
        createdCards: result.createdCards,
        updatedCards: result.updatedCards,
        skippedCards: result.skippedCards,
        conflicts: result.conflicts,
        missingInFile: result.missingInFile,
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return recallErrorResponse(c, err);
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
    required: true,
    body: {
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
    404: { description: "卡组不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardUpsertRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");

  try {
    const { cardId } = await upsertCard(identity.effectiveUserId, {
      deckKey: body.deckKey,
      cardId: body.cardId,
      prompt: body.prompt,
      kind: body.kind,
      items: body.items,
      blanks: body.blanks,
      verbatim: body.verbatim,
      groupId: body.groupId,
    });

    return c.json({ cardId, cardKey: body.cardId }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return recallErrorResponse(c, err);
  }
});

// ---------- DELETE /recall/decks/:deckKey/cards/:cardKey ----------

const recallCardDeleteRoute = createRoute({
  method: "delete",
  path: "/recall/decks/:deckKey/cards/:cardKey",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "删除一张回忆卡（含其全部作答日志与进度）",
  description:
    "写接口，需 write 作用域。删除是全局的：卡片内容共存，删除后所有用户都看不到它，其作答日志与进度一并删除（与界面上的删除行为一致）。卡组或卡片不存在返回 404。",
  request: {
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
            deleted: z.literal(true).describe("恒为 true"),
          }),
        },
      },
      description: "已删除",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    404: { description: "卡组不存在 / 卡片不在该卡组里" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardDeleteRoute, async (c) => {
  const identity = requireIdentity(c);
  const { deckKey, cardKey } = c.req.valid("param");

  try {
    const { cardId } = await deleteCard(
      identity.effectiveUserId,
      deckKey,
      cardKey,
    );
    return c.json({ cardId, cardKey, deleted: true as const }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return recallErrorResponse(c, err);
  }
});

// ==================== 工具函数 ====================
// JSON 解析统一走 @/lib/utils/json 的 safeParseJson（本文件原有的 safeJsonParse 是重复实现）

export default app;
