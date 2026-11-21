/**
 * 试卷 / 模考 REST（docs/exam-paper-plan.md §2，契约冻结）。
 *
 * 九条端点全部 `authMiddleware`；归属一律按 `userId` 过滤，跨用户按 404 处理
 * （不是 403：不泄露"这个 id 存在"）。业务逻辑全在 `services/exam.ts`，
 * 这里只做参数校验与错误 → HTTP 的映射。
 *
 * 状态码约定沿用仓库既有风格：成功统一 200（不引入 201，客户端只需要看 body）；
 * 候选不足 / 题目 id 不合法 → 400 且带结构化字段（不静默缩水）。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import {
  examService,
  PaperQuestionInvalidError,
  PaperShortfallError,
} from "@/lib/services/exam";
import type { Context } from "hono";

const app = new OpenAPIHono();

// --- 共享 schema ---

const QuestionPayloadSchema = z.object({
  id: z.number(),
  content: z.string(),
  options: z.array(z.string()),
  /** 作答态为空串（防作弊），交卷后/试卷详情里是真实答案 */
  answer: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
  dimension: z.string().nullable(),
  type: z.string().nullable(),
  material: z.string().nullable(),
});

/**
 * 试卷预览用的题目：**不含 answer / explanation**（冻结决定 4）。
 * 对象里不出现这两个键，OpenAPI 快照直接表达"没有"。
 */
const QuestionPreviewSchema = QuestionPayloadSchema.omit({
  answer: true,
  explanation: true,
});

const PaperSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: z.enum(["fixed", "timed"]),
  durationMinutes: z.number().nullable(),
  /** agent = AI 题集一键成卷（docs/agent-question-set-plan.md §4.2） */
  source: z.enum(["manual", "auto", "agent"]),
  totalQuestions: z.number(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  attemptCount: z.number(),
  bestScore: z.number().nullable(),
  lastScore: z.number().nullable(),
  lastAttemptAt: z.string().nullable(),
});

/** 试卷详情里的"最近一次已交卷作答"（冻结决定 10）：固定三字段 */
const LastAttemptSchema = z.object({
  sessionId: z.string(),
  /** 0–1 小数（冻结决定 7） */
  score: z.number(),
  submittedAt: z.string(),
});

/**
 * 试卷详情 DTO：`GET /papers/{id}` 与 `POST /papers/generate` **完全同形**
 * （冻结决定 8，自动组卷后客户端直接跳详情，不再解一层 rules 包装）。
 */
const PaperDetailSchema = z.object({
  paper: PaperSummarySchema,
  items: z.array(
    z.object({ position: z.number(), question: QuestionPreviewSchema }),
  ),
  lastAttempt: LastAttemptSchema.nullable(),
});

const PerQuestionSchema = z.object({
  questionId: z.number(),
  isCorrect: z.boolean(),
  correctAnswer: z.string(),
  explanation: z.string(),
});

const SubmitResultSchema = z.object({
  score: z.number(),
  correctCount: z.number(),
  totalQuestions: z.number(),
  durationMs: z.number(),
  overtimeMs: z.number(),
  overtime: z.boolean(),
  duplicate: z.boolean(),
  perQuestion: z.array(PerQuestionSchema),
});

/**
 * 业务错误 → 响应。
 *
 * 两个"带结构化字段"的 400 必须在这里显式展开：`toErrorResponse` 只渲染
 * `error/code`，客户端（Web 与移动端）靠 `shortfall` / `missingQuestionIds`
 * 决定提示文案与跳转，不能丢。
 */
function respondError(c: Context, err: unknown, scope: string) {
  if (err instanceof PaperShortfallError) {
    return c.json(
      {
        error: err.publicMessage,
        code: err.code,
        requested: err.requested,
        available: err.available,
        shortfall: err.shortfall,
      },
      400,
    );
  }
  if (err instanceof PaperQuestionInvalidError) {
    return c.json(
      {
        error: err.publicMessage,
        code: err.code,
        missingQuestionIds: err.missingQuestionIds,
        unsupportedQuestionIds: err.unsupportedQuestionIds,
      },
      400,
    );
  }
  return toErrorResponse(c, err, { scope });
}

// --- GET /papers ---

const listPapersRoute = createRoute({
  method: "get",
  path: "/papers",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: "试卷列表（含作答统计；形状与 recall/external 列表一致）",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(PaperSummarySchema),
            meta: z.object({
              limit: z.number(),
              offset: z.number(),
              total: z.number(),
            }),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
  },
});

app.openapi(listPapersRoute, async (c) => {
  const user = getCurrentUser(c);
  const { limit, offset } = c.req.valid("query");
  try {
    const result = await examService.listPapers(user.id, { limit, offset });
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.list");
  }
});

// --- POST /papers（手工组卷） ---

const CreatePaperSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["fixed", "timed"]).default("fixed"),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  questionIds: z.array(z.number().int().positive()).min(1).max(300),
});

const createPaperRoute = createRoute({
  method: "post",
  path: "/papers",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreatePaperSchema } },
    },
  },
  responses: {
    200: {
      description: "试卷已创建",
      content: {
        "application/json": {
          schema: z.object({
            paper: PaperSummarySchema,
            items: z.array(
              z.object({ position: z.number(), questionId: z.number() }),
            ),
          }),
        },
      },
    },
    400: {
      description:
        "参数不合法 / questionIds 含不存在或非客观题的题目（body 含 missingQuestionIds、unsupportedQuestionIds）",
    },
  },
});

app.openapi(createPaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const body = c.req.valid("json");
  try {
    const result = await examService.createPaper(user.id, body);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.create");
  }
});

// --- POST /papers/generate（自动组卷） ---
// 必须注册在 `/papers/{id}` 之前：否则 "generate" 会被当成 id

const GeneratePaperSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["fixed", "timed"]).default("fixed"),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  count: z.number().int().min(1).max(300),
  tags: z.array(z.string().min(1).max(50)).max(30).optional(),
  dimensions: z
    .array(z.enum(["knowledge", "understanding", "application"]))
    .max(3)
    .optional(),
  types: z
    .array(z.enum(["single", "multi", "truefalse", "fill_blank"]))
    .max(4)
    .optional(),
  excludeRecentDays: z.number().int().min(0).max(365).optional(),
  weights: z
    .object({
      wrong: z.number().min(0).max(1).optional(),
      weak: z.number().min(0).max(1).optional(),
      fresh: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const generatePaperRoute = createRoute({
  method: "post",
  path: "/papers/generate",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: GeneratePaperSchema } },
    },
  },
  responses: {
    200: {
      description:
        "自动组卷完成（source=auto 的普通试卷；响应与 GET /papers/{id} 完全同形）",
      content: {
        "application/json": { schema: PaperDetailSchema },
      },
    },
    400: {
      description:
        "参数不合法 / 候选不足（body 含 requested、available、shortfall）",
    },
  },
});

app.openapi(generatePaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const body = c.req.valid("json");
  try {
    const result = await examService.generatePaper(user.id, body);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.generate");
  }
});

// --- GET /papers/{id} ---

const getPaperRoute = createRoute({
  method: "get",
  path: "/papers/{id}",
  middleware: [authMiddleware] as const,
  request: { params: z.object({ id: z.coerce.number().int().positive() }) },
  responses: {
    200: {
      description: "试卷详情（预览：不含 answer/explanation）与最近一次作答",
      content: {
        "application/json": { schema: PaperDetailSchema },
      },
    },
    404: {
      description: "试卷不存在（或不属于当前用户）",
    },
  },
});

app.openapi(getPaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");
  try {
    const result = await examService.getPaper(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.get");
  }
});

// --- PATCH /papers/{id}（只改元信息，MVP 不编辑题目） ---

const UpdatePaperSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  kind: z.enum(["fixed", "timed"]).optional(),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
});

const updatePaperRoute = createRoute({
  method: "patch",
  path: "/papers/{id}",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: {
      required: true,
      content: { "application/json": { schema: UpdatePaperSchema } },
    },
  },
  responses: {
    200: {
      description: "试卷元信息已更新",
      content: {
        "application/json": { schema: z.object({ paper: PaperSummarySchema }) },
      },
    },
    400: {
      description: "参数不合法（如 timed 缺 durationMinutes）",
    },
    404: {
      description: "试卷不存在（或不属于当前用户）",
    },
  },
});

app.openapi(updatePaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  try {
    const paper = await examService.updatePaper(user.id, id, body);
    return c.json({ paper }, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.update");
  }
});

// --- DELETE /papers/{id}（有作答 → 409，先保留历史） ---

const deletePaperRoute = createRoute({
  method: "delete",
  path: "/papers/{id}",
  middleware: [authMiddleware] as const,
  request: { params: z.object({ id: z.coerce.number().int().positive() }) },
  responses: {
    200: {
      description: "试卷已删除（items 级联删除）",
      content: {
        "application/json": { schema: z.object({ deleted: z.boolean() }) },
      },
    },
    404: {
      description: "试卷不存在（或不属于当前用户）",
    },
    409: {
      description: "试卷已有作答记录，不能删除",
    },
  },
});

app.openapi(deletePaperRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");
  try {
    const result = await examService.deletePaper(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.papers.delete");
  }
});

// --- POST /papers/{id}/attempts（开始作答） ---

const startAttemptRoute = createRoute({
  method: "post",
  path: "/papers/{id}/attempts",
  middleware: [authMiddleware] as const,
  request: { params: z.object({ id: z.coerce.number().int().positive() }) },
  responses: {
    200: {
      description: "作答已开始（题目里的 answer 已置空）",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            paperId: z.number(),
            deadlineAt: z.string().nullable(),
            questions: z.array(QuestionPayloadSchema),
          }),
        },
      },
    },
    400: {
      description: "试卷没有题目",
    },
    404: {
      description: "试卷不存在（或不属于当前用户）",
    },
  },
});

app.openapi(startAttemptRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");
  try {
    const result = await examService.startAttempt(user.id, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.attempts.start");
  }
});

// --- GET /attempts/{sessionId}（作答态 / 结果态） ---

const getAttemptRoute = createRoute({
  method: "get",
  path: "/attempts/{sessionId}",
  middleware: [authMiddleware] as const,
  request: { params: z.object({ sessionId: z.string().min(1) }) },
  responses: {
    200: {
      description: "作答态（answer 置空）或结果态（含 result/answers）",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            paper: PaperSummarySchema,
            deadlineAt: z.string().nullable(),
            submittedAt: z.string().nullable(),
            questions: z.array(QuestionPayloadSchema),
            // 冻结决定 9：固定两字段；未作答的题不出现；作答态为空数组
            answers: z.array(
              z.object({
                questionId: z.number(),
                userAnswer: z.string(),
              }),
            ),
            result: SubmitResultSchema.optional(),
          }),
        },
      },
    },
    404: {
      description: "作答不存在（或不属于当前用户 / 不是试卷作答）",
    },
  },
});

app.openapi(getAttemptRoute, async (c) => {
  const user = getCurrentUser(c);
  const { sessionId } = c.req.valid("param");
  try {
    const result = await examService.getAttempt(user.id, sessionId);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.attempts.get");
  }
});

// --- POST /attempts/{sessionId}/submit（交卷，幂等） ---

const SubmitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        userAnswer: z.string().nullable().optional(),
        durationMs: z.number().int().min(0).nullable().optional(),
      }),
    )
    .max(500),
  /** 仅作日志/兜底：幂等依据是 sessionId（§4） */
  clientKey: z.string().max(200).optional(),
});

const submitAttemptRoute = createRoute({
  method: "post",
  path: "/attempts/{sessionId}/submit",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ sessionId: z.string().min(1) }),
    body: {
      required: true,
      content: { "application/json": { schema: SubmitAttemptSchema } },
    },
  },
  responses: {
    200: {
      description: "已交卷（重复提交回 duplicate:true，不写库）",
      content: { "application/json": { schema: SubmitResultSchema } },
    },
    404: {
      description: "作答不存在（或不属于当前用户 / 不是试卷作答）",
    },
  },
});

app.openapi(submitAttemptRoute, async (c) => {
  const user = getCurrentUser(c);
  const { sessionId } = c.req.valid("param");
  const { answers, clientKey } = c.req.valid("json");
  try {
    const result = await examService.submitAttempt(
      user.id,
      sessionId,
      answers,
      clientKey,
    );
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 respondError → toErrorResponse 归类
    //   （业务错误 → 4xx 带可读原因；未知错误已在那里记结构化日志后回 500），
    //   这里只额外展开 shortfall / 缺失 id 两个结构化字段
    return respondError(c, err, "exam.attempts.submit");
  }
});

export default app;
