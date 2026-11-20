/**
 * `/api/external/agent/*` —— Agent 推题 / 题集的写读接口（docs/agent-question-set-plan.md §4.1）。
 *
 * 响应形状**逐字对齐 §4.3**（三条 lane 的共同契约）：
 * - 列表一律 `{data, meta:{limit,offset,total}}`；
 * - 详情**含答案与解析**（Agent 要能看自己推了什么）；
 * - 结果回流 `{setId, summary:{…}, items:[…], flagged:[…]}`，分数 0–1、耗时毫秒整数。
 *
 * 作用域全是 **admin**（题库是全局资产，沿用建题口径），且 API Key **必须绑
 * `userId`**：题集是用户私有资源，全局 key（user_id=NULL）没有"谁的数据"可以归属，
 * 一律 403。读他人的批次一律 404（不是 403，不泄露 id 是否存在）。
 *
 * 挂在 `external/index.ts` 的 `/agent` 前缀下，最终路径 `/api/external/agent/...`；
 * 限流、写审计、read 守卫由聚合入口统一提供，这里只声明自己更高的作用域。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { toErrorResponse } from "@/lib/api/error-response";
import { parsePagination } from "@/lib/api/pagination";
import {
  AGENT_SET_MAX_QUESTIONS,
  agentQuestionSetService,
} from "@/lib/services/agent-question-sets";
import {
  DryRunQuerySchema,
  RateLimitedResponse,
  requireIdentity,
  requireScopeMiddleware,
  wantsDryRun,
} from "./external/shared";

const app = new OpenAPIHono();

/** 题集是用户私有资源：没绑 userId 的 key（全局 key）不能操作 */
function requireBoundIdentity(
  identity: ReturnType<typeof requireIdentity>,
): { userId: number } | { error: string; status: 403 } {
  if (identity.userId === null) {
    return {
      error:
        "该 API Key 没有绑定用户（全局 key），不能操作个人题集：请创建一个绑定 userId 的 key",
      status: 403,
    };
  }
  return { userId: identity.userId };
}

// --- 共享 schema（§4.3） ---

const SetSummarySchema = z
  .object({
    id: z.number().int(),
    batchKey: z.string().describe("Agent 的批次幂等键"),
    title: z.string(),
    agent: z.string().nullable().describe("哪个工具推的，如 claude-code"),
    model: z.string().nullable(),
    promptVersion: z.string().nullable(),
    targetTags: z.array(z.string()).describe("Agent 声称针对的考点"),
    note: z.string().nullable().describe("「为什么给你出这些」"),
    status: z.enum(["active", "archived", "promoted"]),
    questionCount: z
      .number()
      .int()
      .describe("该批可用题数（已报错的题不计入）"),
    doneCount: z
      .number()
      .int()
      .describe("该批已作答的题数（只看本批次的作答）"),
    flaggedCount: z.number().int().describe("用户报「这题有问题」的题数"),
    createdAt: z.string().nullable(),
  })
  .openapi("AgentQuestionSetSummary");

const SetQuestionSchema = z
  .object({
    id: z.number().int(),
    position: z.number().int().nullable().describe("批次内顺序（1..n）"),
    externalId: z
      .string()
      .nullable()
      .describe("你推送时给的题号（没给为 null）"),
    content: z.string(),
    options: z.array(z.string()),
    answer: z.string().describe("正确答案"),
    explanation: z.string().nullable(),
    type: z.string().nullable(),
    dimension: z.string().nullable(),
    tags: z.array(z.string()),
    material: z.string().nullable(),
  })
  .openapi("AgentQuestionSetQuestion");

const SetResultItemSchema = z
  .object({
    questionId: z.number().int(),
    answered: z.boolean(),
    isCorrect: z.boolean().describe("未作答时为 false（看 answered 区分）"),
    durationMs: z
      .number()
      .int()
      .nullable()
      .describe("最近一次作答耗时（毫秒）"),
    flagged: z.boolean(),
    flagReason: z.string().nullable(),
  })
  .openapi("AgentQuestionSetResultItem");

const SetResultsSchema = z
  .object({
    setId: z.number().int(),
    summary: z.object({
      answered: z.number().int().describe("已作答的可用题数"),
      total: z.number().int().describe("该批题总数（含已报错的题）"),
      correctRate: z.number().describe("correct / answered，0–1 小数"),
      avgDurationMs: z.number().int().describe("已作答题的平均耗时（毫秒）"),
      tagBreakdown: z.array(
        z.object({
          tag: z.string(),
          answered: z.number().int(),
          correctRate: z.number().describe("0–1 小数"),
        }),
      ),
    }),
    items: z.array(SetResultItemSchema),
    flagged: z
      .array(
        z.object({
          questionId: z.number().int(),
          content: z.string(),
          reason: z.string().nullable(),
        }),
      )
      .describe("被用户报「这题有问题」的题：修正后请推新批次"),
  })
  .openapi("AgentQuestionSetResults");

// --- POST /agent/question-sets ---

const CreateSetItemSchema = z.object({
  externalId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("你自己的题号（可选）：会原样回显，并参与外部幂等键的命名空间"),
  content: z.string().describe("题干纯文本"),
  options: z
    .array(z.string())
    .optional()
    .describe("选项文本；判断题两个、填空题可空"),
  answer: z
    .string()
    .describe(
      '正确答案：单选传标号（A）/ 多选传 JSON 数组字符串（如 ["A","C"]）/ 判断 A 或 B / 填空自由文本',
    ),
  explanation: z
    .string()
    .describe("解析（至少 5 个字符，与 QuestionSchema 一致）"),
  tags: z.array(z.string()).describe("知识点标签，至少 1 个"),
  dimension: z
    .enum(["knowledge", "understanding", "application"])
    .optional()
    .describe("能力维度，省略时按 knowledge 落库"),
  type: z
    .enum(["single", "multi", "truefalse", "fill_blank"])
    .optional()
    .describe("题型，省略时按 single 落库"),
  material: z.string().optional().describe("材料原文（原样落库，可为空）"),
});

const CreateSetBodySchema = z
  .object({
    batchKey: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "批次幂等键：同一 key 重推返回原批次（duplicate=true）且不新增；批次不可变，新内容请用新 key",
      ),
    title: z.string().trim().min(1).max(200),
    agent: z
      .string()
      .max(100)
      .optional()
      .describe("哪个工具推的，如 claude-code"),
    model: z.string().max(100).optional(),
    promptVersion: z.string().max(100).optional(),
    targetTags: z.array(z.string()).max(50).optional(),
    note: z.string().max(2000).optional().describe("「为什么给你出这些」"),
    questions: z
      .array(CreateSetItemSchema)
      .min(1)
      .max(AGENT_SET_MAX_QUESTIONS)
      .describe(
        `本批题目，1–${AGENT_SET_MAX_QUESTIONS} 道；整批原子：任一条不合法则一条都不写`,
      ),
  })
  .openapi("AgentQuestionSetCreateRequest");

const CreateSetResponseSchema = z
  .object({
    id: z
      .number()
      .int()
      .nullable()
      .describe("批次 ID；预演且需要新建时为 null"),
    batchKey: z.string(),
    duplicate: z
      .boolean()
      .describe("true = 该 batchKey 已存在，本次没有写入任何数据"),
    questionCount: z
      .number()
      .int()
      .describe("该批题数（幂等命中为既有批次的题数）"),
    dryRun: z
      .boolean()
      .optional()
      .describe("仅预演时出现且恒为 true：库内零变更"),
  })
  .openapi("AgentQuestionSetCreateResponse");

const createSetRoute = createRoute({
  method: "post",
  path: "/question-sets",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "推送一批题（需 admin 作用域，key 必须绑定 userId）",
  description:
    "写接口，**需 admin 作用域且 key 绑定 userId**（题集是用户私有资源，全局 key 一律 403）。整批原子：逐条复用 `QuestionSchema`，任一条不合法返回 400 且一条都不写（`issues` 逐条列出）。幂等：`(userId, batchKey)` 唯一，重推返回既有批次 `duplicate=true` 且不新增；批次不可变，新内容只能新建批次。单批上限 100 题。预演传 `?dryRun=true`：只校验不写库（此时 `id=null`、`dryRun=true`）。",
  request: {
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: CreateSetBodySchema } },
    },
  },
  responses: {
    200: {
      description: "批次已创建（或幂等命中既有批次）",
      content: { "application/json": { schema: CreateSetResponseSchema } },
    },
    400: {
      description:
        "请求体校验失败 / 任一条题目不合法（整批未写入，body 含 issues、issueCount）",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: {
      description: "已禁止 - 作用域不足（需要 admin）/ 该 key 没有绑定 userId",
    },
    429: RateLimitedResponse,
  },
});

app.openapi(createSetRoute, async (c) => {
  const bound = requireBoundIdentity(requireIdentity(c));
  if ("error" in bound) return c.json({ error: bound.error }, 403);

  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const result = await agentQuestionSetService.createSet(bound.userId, body, {
      dryRun,
    });
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse（业务错误 → 4xx 带 issues；未知错误已在那里
    //   记结构化日志后回 500）
    return toErrorResponse(c, err, { scope: "external.agent.sets.create" });
  }
});

// --- GET /agent/question-sets ---

const listSetsRoute = createRoute({
  method: "get",
  path: "/question-sets",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "我的题集列表",
  description:
    "只读接口，**需 admin 作用域且 key 绑定 userId**。返回该 key 所属用户的题集（含批次题量、已做数、待处理报错数）；分页口径 `limit`（默认 20、上限 100）/ `offset`（默认 0），`meta` 回显夹取后的实际值。",
  request: {
    query: z.object({
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "题集列表（分页）",
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
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: {
      description: "已禁止 - 作用域不足（需要 admin）/ 该 key 没有绑定 userId",
    },
    429: RateLimitedResponse,
  },
});

app.openapi(listSetsRoute, async (c) => {
  const bound = requireBoundIdentity(requireIdentity(c));
  if ("error" in bound) return c.json({ error: bound.error }, 403);

  const { limit, offset } = parsePagination(c.req.valid("query"));

  try {
    const result = await agentQuestionSetService.listSetsForAgent(
      bound.userId,
      { limit, offset },
    );
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "external.agent.sets.list" });
  }
});

// --- GET /agent/question-sets/{id} ---

const getSetRoute = createRoute({
  method: "get",
  path: "/question-sets/{id}",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "题集详情（含题目与答案）",
  description:
    "只读接口，**需 admin 作用域且 key 绑定 userId**。Agent 需要看自己推了什么，因此**含答案与解析**；他人的题集一律 404。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "题集详情",
      content: {
        "application/json": {
          schema: z.object({
            set: SetSummarySchema,
            questions: z.array(SetQuestionSchema),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: {
      description: "已禁止 - 作用域不足（需要 admin）/ 该 key 没有绑定 userId",
    },
    404: { description: "题集不存在（或不属于该 key 的用户）" },
    429: RateLimitedResponse,
  },
});

app.openapi(getSetRoute, async (c) => {
  const bound = requireBoundIdentity(requireIdentity(c));
  if ("error" in bound) return c.json({ error: bound.error }, 403);

  const { id } = c.req.valid("param");
  try {
    const result = await agentQuestionSetService.getSetForAgent(
      bound.userId,
      id,
    );
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "external.agent.sets.get" });
  }
});

// --- GET /agent/question-sets/{id}/results ---

const getResultsRoute = createRoute({
  method: "get",
  path: "/question-sets/{id}/results",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "结果回流：逐题对错/耗时/报错，聚合正确率与考点分布",
  description:
    "只读接口，**需 admin 作用域且 key 绑定 userId**。只统计**该批次自己的作答会话**（普通练习里答过同一道题不算）。每题取最近一次非空作答；`flagged[]` 列出被用户报「这题有问题」的题与理由，供修正后推新批次。分数一律 0–1 小数，`durationMs` 为整数毫秒。他人的题集一律 404。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "结果回流",
      content: { "application/json": { schema: SetResultsSchema } },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: {
      description: "已禁止 - 作用域不足（需要 admin）/ 该 key 没有绑定 userId",
    },
    404: { description: "题集不存在（或不属于该 key 的用户）" },
    429: RateLimitedResponse,
  },
});

app.openapi(getResultsRoute, async (c) => {
  const bound = requireBoundIdentity(requireIdentity(c));
  if ("error" in bound) return c.json({ error: bound.error }, 403);

  const { id } = c.req.valid("param");
  try {
    const result = await agentQuestionSetService.getResults(bound.userId, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "external.agent.sets.results" });
  }
});

// --- POST /agent/question-sets/{id}/archive ---

const archiveSetRoute = createRoute({
  method: "post",
  path: "/question-sets/{id}/archive",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "归档题集（不影响历史作答）",
  description:
    "写接口，**需 admin 作用域且 key 绑定 userId**。归档后该批次不能再作答 / 成卷 / 转正，列表与结果仍可读。幂等：重复归档不报错。",
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: "已归档（重复归档同样返回 200）",
      content: { "application/json": { schema: SetSummarySchema } },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: {
      description: "已禁止 - 作用域不足（需要 admin）/ 该 key 没有绑定 userId",
    },
    404: { description: "题集不存在（或不属于该 key 的用户）" },
    429: RateLimitedResponse,
  },
});

app.openapi(archiveSetRoute, async (c) => {
  const bound = requireBoundIdentity(requireIdentity(c));
  if ("error" in bound) return c.json({ error: bound.error }, 403);

  const { id } = c.req.valid("param");
  try {
    const result = await agentQuestionSetService.archiveSet(bound.userId, id);
    return c.json(result, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse
    return toErrorResponse(c, err, { scope: "external.agent.sets.archive" });
  }
});

export default app;
