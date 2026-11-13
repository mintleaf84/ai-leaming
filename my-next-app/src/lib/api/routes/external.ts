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

// ==================== 工具函数 ====================
// JSON 解析统一走 @/lib/utils/json 的 safeParseJson（本文件原有的 safeJsonParse 是重复实现）

export default app;
