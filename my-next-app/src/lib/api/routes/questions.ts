import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { questionService } from "@/lib/services/question";
import {
  authMiddleware,
  getCurrentUser,
} from "@/lib/api/middlewares/auth";
import { parsePagination } from "@/lib/api/pagination";
import { toErrorResponse } from "@/lib/api/error-response";

const app = new OpenAPIHono();

// Response Schema (Subset of DB schema for client)
const QuestionResponseSchema = z.object({
  id: z.number(),
  content: z.string(),
  options: z.array(z.string()),
  type: z.enum(["single", "multi"]).optional(),
  tags: z.array(z.string()),
  dimension: z.string().optional(),
});

const QuestionListSchema = z.object({
  items: z.array(QuestionResponseSchema),
  total: z.number(),
});

// List Questions
const listRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      page: z.string().optional().default("1"),
      limit: z.string().optional().default("20"),
      search: z.string().optional(),
      type: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: QuestionListSchema,
        },
      },
      description: "List of questions",
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { page, limit, search, type } = c.req.valid("query");
  // 分页统一走共享实现：非法值回落默认、上限截断，避免 NaN 下沉到 SQL
  const { limit: limitNum } = parsePagination({ limit });
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const result = await questionService.list({
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    search,
    type: type ? [type] : undefined,
  });

  // Transform DB result to API response (handling validation/stripping)
  const items = result.items.map((q) => ({
    id: q.id,
    content: q.content,
    options: q.options,
    type: q.type === "single" || q.type === "multi" ? q.type : undefined,
    tags: q.tags,
    dimension: q.dimension,
  }));

  return c.json({
    items,
    total: result.total,
  });
});

// Get Question Detail
const getRoute = createRoute({
  method: "get",
  path: "/:id",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: QuestionResponseSchema.extend({
            explanation: z.string().optional(),
            answer: z.string().optional(), // Reveal answer in detail? Or only after submit?
            // Usually detail view implies study mode, so maybe yes.
          }),
        },
      },
      description: "Question detail",
    },
    404: {
      description: "Question not found",
    },
  },
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const question = await questionService.getById(parseInt(id));

  if (!question) {
    return c.json({ error: "Question not found" }, 404);
  }

  return c.json({
    id: question.id,
    content: question.content,
    options: question.options,
    type:
      question.type === "single" || question.type === "multi"
        ? question.type
        : undefined,
    tags: question.tags,
    dimension: question.dimension,
    explanation: question.explanation,
    answer: question.answer,
  });
});

// ==================== 建题 / 改题（§35） ====================
// 校验只有一份：`questionService.create/update` 内部用 `QuestionSchema`（与外部
// API、后台导入同一口径）。路由只负责 "HTTP 形状 ↔ 服务调用"，不复制校验规则。

const QuestionWriteBodySchema = z.object({
  content: z.string().min(5).describe("题干，至少 5 个字符"),
  options: z.array(z.string().min(1)).max(10).default([]),
  answer: z
    .string()
    .min(1)
    .describe('正确答案：单选 "A"、多选 ["A","B"]（JSON 字符串）、判断题 A/B、填空为文本'),
  explanation: z.string().min(5),
  tags: z.array(z.string().min(1)).min(1),
  dimension: z.enum(["knowledge", "understanding", "application"]),
  type: z
    .enum(["single", "multi", "truefalse", "fill_blank"])
    .default("single"),
  material: z.string().optional(),
  material_html: z.string().optional(),
});

// 不能用 `.partial()`：zod 的 default 会补值，导致"只改解析"被悄悄带上
// type/options 的默认值（与 external PATCH 同一坑）
const QuestionPatchBodySchema = z
  .object({
    content: z.string().min(5).optional(),
    options: z.array(z.string().min(1)).max(10).optional(),
    answer: z.string().min(1).optional(),
    explanation: z.string().min(5).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    dimension: z
      .enum(["knowledge", "understanding", "application"])
      .optional(),
    type: z.enum(["single", "multi", "truefalse", "fill_blank"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少要改一个字段",
  });

function actorFrom(c: Parameters<typeof getCurrentUser>[0]) {
  const user = getCurrentUser(c);
  return {
    id: user.id,
    username: user.username,
    ip_address:
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-real-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
  };
}

const createQuestionRoute = createRoute({
  method: "post",
  path: "/",
  middleware: [authMiddleware] as const,
  summary: "新建一道题（登录即可）",
  description:
    "幂等键 = `manual:<userId>:<内容指纹>`：同一用户重复提交同一内容返回既有题（`created=false`），不新增行。写操作进 `admin_logs`（action=QUESTION_CREATE）。",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: QuestionWriteBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            created: z.boolean(),
          }),
        },
      },
      description: "幂等命中既有题（created=false）",
    },
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            created: z.boolean(),
          }),
        },
      },
      description: "已新建",
    },
    400: { description: "内容校验失败（带 issues）" },
    401: { description: "未登录" },
  },
});

app.openapi(createQuestionRoute, async (c) => {
  try {
    const body = c.req.valid("json");
    const result = await questionService.create(body as never, {
      actor: actorFrom(c),
      source: "manual",
    });
    return c.json(
      { id: result.id, created: result.created },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return toErrorResponse(c, error, { scope: "questions.create" });
  }
});

const updateQuestionRoute = createRoute({
  method: "patch",
  path: "/{id}",
  middleware: [authMiddleware] as const,
  summary: "修改一道题（登录即可）",
  description:
    "部分更新，合并后仍要整体满足 `QuestionSchema`。答案/选项/题型变化时在同一事务里回刷历史判分（`regradeQuestionLogs`）。只能改自己建的题（`manual:`/`draft:` 归属），全局题登录用户均可维护。",
  request: {
    params: z.object({ id: z.string() }),
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
            changed: z.array(z.string()),
            regrade: z
              .object({
                logsScanned: z.number().int(),
                logsFlipped: z.number().int(),
                usersReset: z.number().int(),
                sessionsUpdated: z.number().int(),
              })
              .nullable(),
            question: QuestionResponseSchema.extend({
              explanation: z.string().nullable().optional(),
              answer: z.string().nullable().optional(),
            }),
          }),
        },
      },
      description: "已更新（或没有实际变更）",
    },
    400: { description: "ID 非法/合并后校验失败（带 issues）" },
    401: { description: "未登录" },
    403: { description: "非本人创建的题目" },
    404: { description: "题目不存在" },
  },
});

app.openapi(updateQuestionRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const questionId = Number(id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return c.json({ error: "题目 ID 必须是正整数" }, 400);
    }
    const body = c.req.valid("json");
    const result = await questionService.update(questionId, body as never, {
      actor: actorFrom(c),
    });
    const question = await questionService.getById(questionId);
    return c.json(
      {
        id: result.id,
        changed: result.changed,
        regrade: result.regrade
          ? {
              logsScanned: result.regrade.logsScanned,
              logsFlipped: result.regrade.logsFlipped,
              usersReset: result.regrade.usersReset,
              sessionsUpdated: result.regrade.sessionsUpdated,
            }
          : null,
        question: question
          ? {
              id: question.id,
              content: question.content,
              options: question.options,
              type:
                question.type === "single" || question.type === "multi"
                  ? question.type
                  : undefined,
              tags: question.tags,
              dimension: question.dimension,
              explanation: question.explanation,
              answer: question.answer,
            }
          : null,
      },
      200,
    );
  } catch (error) {
    return toErrorResponse(c, error, { scope: "questions.update" });
  }
});

export default app;
