/**
 * `/api/agent-sets` —— AI 题集的消费侧接口（docs/agent-question-set-plan.md §4.2）。
 *
 * 响应形状**逐字对齐 §4.3**：
 * - 列表 `{data, meta}`；
 * - 详情**不含** answer/explanation（练习页不能提前拿答案），`flaggedCount` 单独给；
 * - 一键成卷与试卷详情同形 `{paper, items, lastAttempt}`；
 * - 分数一律 0–1 小数，`durationMs` 整数毫秒。
 *
 * 全部 `authMiddleware`（用户 JWT），归属按 `userId` 过滤，跨用户一律 404
 * （不是 403：不泄露"这个 id 存在"）。业务逻辑全在
 * `services/agent-question-sets.ts`，这里只做参数校验与错误 → HTTP 映射。
 *
 * 判分**不在本模块**：逐题提交复用 `POST /api/practice/session/{id}/submit`
 * （唯一的判分实现），这里只负责开会话 / 报错 / 转正 / 成卷。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import { parsePagination } from "@/lib/api/pagination";
import { agentQuestionSetService } from "@/lib/services/agent-question-sets";

const app = new OpenAPIHono();

// --- 共享 schema（§4.3） ---

const SetSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  agent: z.string().nullable(),
  model: z.string().nullable(),
  targetTags: z.array(z.string()),
  status: z
    .enum(["active", "promoted", "archived"])
    .describe("active=可练；promoted=已转正入库；archived=已归档"),
  questionCount: z
    .number()
    .int()
    .describe("批次原始题量（含被用户报错移除的题）"),
  pendingCount: z.number().int().describe("未作答的可用题数"),
  unreadCount: z
    .number()
    .int()
    .describe(
      "未读题数：该批还没有任何作答记录时等于 questionCount，否则为 0（客户端求和即首页角标）",
    ),
  lastScore: z.number().nullable().describe("最近一次作答的正确率（0–1）"),
  createdAt: z.string().nullable(),
});

/** 消费侧题目：**不含**答案与解析 */
const SetQuestionSchema = z.object({
  id: z.number().int(),
  content: z.string(),
  options: z.array(z.string()),
  type: z.string().nullable(),
  dimension: z.string().nullable(),
  tags: z.array(z.string()),
  material: z.string().nullable(),
});

/** 与 `GET /api/exam/papers/{id}` 同形（复用 exam 的 DTO，不另拼一份） */
const PaperSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  kind: z.enum(["fixed", "timed"]),
  durationMinutes: z.number().nullable(),
  source: z.enum(["manual", "auto", "agent"]),
  totalQuestions: z.number().int(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  attemptCount: z.number().int(),
  bestScore: z.number().nullable(),
  lastScore: z.number().nullable(),
  lastAttemptAt: z.string().nullable(),
});

const PaperDetailSchema = z.object({
  paper: PaperSummarySchema,
  items: z.array(
    z.object({
      position: z.number().int(),
      question: z.object({
        id: z.number().int(),
        content: z.string(),
        options: z.array(z.string()),
        tags: z.array(z.string()),
        dimension: z.string().nullable(),
        type: z.string().nullable(),
        material: z.string().nullable(),
      }),
    }),
  ),
  lastAttempt: z
    .object({
      sessionId: z.string(),
      score: z.number().describe("0–1 小数"),
      submittedAt: z.string(),
    })
    .nullable(),
});

// --- GET / ---

const listSetsRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  request: {
    // 分页口径（§4.3 Web lane 冻结）：`limit` 默认 20 / 上限 100、`offset` 默认 0，
    // meta 回显**夹取后**的实际值。`limit`/`offset` 走 pagination.ts 的共享严格解析。
    query: z.object({
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "我的 AI 题集（未做数、未读数、最近成绩、目标考点）",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(SetSummarySchema),
            meta: z.object({
              limit: z.number().int(),
              offset: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
  },
});

app.openapi(listSetsRoute, async (c) => {
  const user = getCurrentUser(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  try {
    const result = await agentQuestionSetService.listSetsForConsumer(user.id, {
      limit,
      offset,
    });
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.list" });
  }
});

// --- GET /{id} ---

const getSetRoute = createRoute({
  method: "get",
  path: "/{id}",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "题集详情（不含答案；questions 只含可用题）",
      content: {
        "application/json": {
          schema: z.object({
            set: SetSummarySchema,
            questions: z.array(SetQuestionSchema),
            flaggedCount: z.number().int().describe("已报「这题有问题」的题数"),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "题集不存在（或不属于当前用户）" },
  },
});

app.openapi(getSetRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  try {
    const result = await agentQuestionSetService.getSetForConsumer(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.get" });
  }
});

// --- POST /{id}/attempts ---

const startAttemptRoute = createRoute({
  method: "post",
  path: "/{id}/attempts",
  middleware: [authMiddleware] as const,
  summary: "开始练这批题（建练习会话）",
  description:
    "建一条 `practice_mode='agent_set'` 的练习会话（`agent_set_id` 指向题集），返回**不含答案**的题目。逐题提交复用 `POST /api/practice/session/{sessionId}/submit`（判分只有那一份实现）。每次调用都是新的作答会话。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "会话已创建",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            questions: z.array(SetQuestionSchema),
          }),
        },
      },
    },
    400: { description: "题集没有可用题目（全部被标记或已转正）" },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "题集不存在（或不属于当前用户）" },
    409: { description: "题集已归档 / 已转正，不能再作答" },
  },
});

app.openapi(startAttemptRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  try {
    const result = await agentQuestionSetService.startAttempt(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.attempts" });
  }
});

// --- POST /{id}/questions/{questionId}/flag ---

const FlagBodySchema = z.object({
  reason: z
    .string()
    .max(500)
    .optional()
    .describe(
      "哪里有问题（题干错 / 答案错 / 选项重复…），原文落库并回传给 agent",
    ),
});

const flagQuestionRoute = createRoute({
  method: "post",
  path: "/{id}/questions/{questionId}/flag",
  middleware: [authMiddleware] as const,
  summary: "报「这题有问题」：移出可用集并记录理由",
  description:
    "该题 `origin` 置 `flagged`（不再出现在题集/成卷/练习里，也不会进掌握度），理由落库并在 agent 的结果回流 `flagged[]` 中回传。幂等：重复标记不报错、不覆盖首次理由。返回剩余可用题数。",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
      questionId: z.coerce.number().int().positive(),
    }),
    body: {
      required: false,
      content: { "application/json": { schema: FlagBodySchema } },
    },
  },
  responses: {
    200: {
      description: "已标记",
      content: {
        "application/json": {
          schema: z.object({
            questionId: z.number().int(),
            flagged: z.boolean().describe("恒为 true（重复标记同样为 true）"),
            remaining: z.number().int().describe("剩余可用题数"),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "题集不存在（或该题不在这个题集里）" },
    409: { description: "题集已归档 / 已转正，不能再标记" },
  },
});

app.openapi(flagQuestionRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id, questionId } = c.req.valid("param");
  const body = c.req.valid("json") as { reason?: string } | undefined;

  try {
    const result = await agentQuestionSetService.flagQuestion(
      user.id,
      id,
      questionId,
      body?.reason,
    );
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.flag" });
  }
});

// --- POST /{id}/promote ---

const promoteSetRoute = createRoute({
  method: "post",
  path: "/{id}/promote",
  middleware: [authMiddleware] as const,
  summary: "转正入库：该批可用题并入正常题库",
  description:
    "把该批仍可用的题 `origin` 改为 `import`（从此进题库列表 / 自动组卷 / 掌握度），题集状态置 `promoted`。已报错的题**不转正**。`agent_set_id` 保留，结果回流仍可追溯。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "已转正",
      content: {
        "application/json": {
          schema: z.object({
            setId: z.number().int(),
            promoted: z.boolean().describe("恒为 true（重复转正返回 409）"),
            promotedCount: z.number().int().describe("转正题数"),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "题集不存在（或不属于当前用户）" },
    409: { description: "题集已归档 / 已转正" },
  },
});

app.openapi(promoteSetRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  try {
    const result = await agentQuestionSetService.promoteSet(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.promote" });
  }
});

// --- POST /{id}/paper ---

const CreatePaperBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  kind: z.enum(["fixed", "timed"]).default("fixed"),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
});

const createPaperRoute = createRoute({
  method: "post",
  path: "/{id}/paper",
  middleware: [authMiddleware] as const,
  summary: "一键成卷：把这批可用题做成一张试卷",
  description:
    "建一张 `source='agent'` 的试卷，题目取该题集**未报错**的题（顺序即题集内顺序）。返回形状与 `GET /api/exam/papers/{id}` **完全同形**（`{paper, items, lastAttempt}`），随后可直接 `POST /api/exam/papers/{id}/attempts` 开始作答。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: {
      required: false,
      content: { "application/json": { schema: CreatePaperBodySchema } },
    },
  },
  responses: {
    200: {
      description: "试卷已创建（与试卷详情同形）",
      content: { "application/json": { schema: PaperDetailSchema } },
    },
    400: { description: "题集没有可用题目 / 限时卷参数不合法" },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "题集不存在（或不属于当前用户）" },
    409: { description: "题集已归档 / 已转正" },
  },
});

app.openapi(createPaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");
  const body = c.req.valid("json") as
    | {
        title?: string;
        kind?: "fixed" | "timed";
        durationMinutes?: number | null;
      }
    | undefined;

  try {
    const result = await agentQuestionSetService.createPaperFromSet(
      user.id,
      id,
      {
        title: body?.title,
        kind: body?.kind,
        durationMinutes: body?.durationMinutes ?? null,
      },
    );
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "agent-sets.paper" });
  }
});

export default app;
